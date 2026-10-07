const API_BASE = '/api';
const KEYCLOAK_BASE = `http://${window.location.hostname}:8082/realms/todo-realm/protocol/openid-connect`;

// DOM elements
const todoList = document.getElementById('todo-list');
const todoForm = document.getElementById('todo-form');
const titleInput = document.getElementById('todo-title');
const descInput = document.getElementById('todo-desc');
const rustBadge = document.getElementById('rust-badge');
const loadingText = document.getElementById('loading');
const toast = document.getElementById('toast');
const userDisplay = document.getElementById('user-display');
const authBtn = document.getElementById('auth-btn');
const loginGate = document.getElementById('login-gate');
const appContent = document.getElementById('app-content');
const gateLoginBtn = document.getElementById('gate-login-btn');

// --- Keycloak OAuth2 / OIDC Flow ---

function redirectToKeycloakLogin() {
    const redirectUri = encodeURIComponent(window.location.origin + '/');
    const authUrl = `${KEYCLOAK_BASE}/auth?client_id=todo-client&redirect_uri=${redirectUri}&response_type=token id_token&scope=openid profile email&nonce=${Date.now()}`;
    window.location.href = authUrl;
}

function redirectToKeycloakLogout() {
    sessionStorage.removeItem('kc_token');
    sessionStorage.removeItem('kc_user');
    const redirectUri = encodeURIComponent(window.location.origin + '/');
    const logoutUrl = `${KEYCLOAK_BASE}/logout?post_logout_redirect_uri=${redirectUri}&client_id=todo-client`;
    window.location.href = logoutUrl;
}

// Extract JWT tokens from URL hash after Keycloak login redirect
function processUrlHashTokens() {
    const hash = window.location.hash.substring(1);
    if (!hash) return;

    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const idToken = params.get('id_token');

    if (accessToken) {
        sessionStorage.setItem('kc_token', accessToken);
        
        let username = 'testuser';
        if (idToken) {
            try {
                const payloadBase64 = idToken.split('.')[1];
                const decoded = JSON.parse(atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/')));
                username = decoded.preferred_username || decoded.name || decoded.email || 'testuser';
            } catch (e) {
                console.warn('Could not parse id_token payload', e);
            }
        }
        sessionStorage.setItem('kc_user', username);

        // Remove tokens from URL bar for clean UI
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// Update UI based on authentication state
function syncAuthState() {
    processUrlHashTokens();

    const token = sessionStorage.getItem('kc_token');
    const username = sessionStorage.getItem('kc_user');

    if (token) {
        // Authenticated State
        userDisplay.textContent = `👤 Logged in as: ${username}`;
        authBtn.textContent = 'Sign Out';
        authBtn.className = 'auth-btn logout';
        authBtn.onclick = redirectToKeycloakLogout;

        loginGate.classList.add('hidden');
        appContent.classList.remove('hidden');

        checkRustWorker();
        loadTodos();
    } else {
        // Unauthenticated State
        userDisplay.textContent = 'Not Logged In';
        authBtn.textContent = 'Sign In';
        authBtn.className = 'auth-btn';
        authBtn.onclick = redirectToKeycloakLogin;

        loginGate.classList.remove('hidden');
        appContent.classList.add('hidden');
        
        checkRustWorker();
    }
}

if (gateLoginBtn) {
    gateLoginBtn.onclick = redirectToKeycloakLogin;
}

// --- Todo & Worker Logic ---

function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3500);
}

async function checkRustWorker() {
    try {
        const res = await fetch(`${API_BASE}/rust/status`);
        if (!res.ok) throw new Error('Worker response not OK');
        const data = await res.json();
        rustBadge.textContent = `Rust Worker: "${data.message || data.status}"`;
        rustBadge.className = 'badge ready';
    } catch (err) {
        rustBadge.textContent = 'Rust Worker: Connecting...';
        rustBadge.className = 'badge';
    }
}

async function loadTodos() {
    try {
        const res = await fetch(`${API_BASE}/todos`);
        if (!res.ok) throw new Error('Failed to load todos');
        const todos = await res.json();
        
        loadingText.style.display = 'none';
        todoList.innerHTML = '';

        if (todos.length === 0) {
            todoList.innerHTML = '<li class="info-text">No tasks yet. Create one above!</li>';
            return;
        }

        todos.forEach(todo => {
            const li = document.createElement('li');
            li.className = `todo-item ${todo.completed ? 'completed' : ''}`;
            li.innerHTML = `
                <div class="todo-content">
                    <input type="checkbox" ${todo.completed ? 'checked' : ''} data-id="${todo.id}">
                    <div class="text-group">
                        <span class="title">${escapeHtml(todo.title)}</span>
                        ${todo.description ? `<span class="desc">${escapeHtml(todo.description)}</span>` : ''}
                    </div>
                </div>
                <button class="delete-btn" data-id="${todo.id}">Delete</button>
            `;
            todoList.appendChild(li);
        });
    } catch (err) {
        loadingText.textContent = 'Failed to load tasks. Make sure backend is running.';
        loadingText.style.color = '#ef4444';
    }
}

todoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = titleInput.value.trim();
    const description = descInput.value.trim();
    if (!title) return;

    try {
        const res = await fetch(`${API_BASE}/todos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, description })
        });
        if (!res.ok) throw new Error('Failed to create todo');
        
        titleInput.value = '';
        descInput.value = '';
        showToast('Task added successfully (FastAPI + Postgres)');
        await loadTodos();
    } catch (err) {
        showToast(`Error: ${err.message}`);
    }
});

todoList.addEventListener('click', async (e) => {
    const target = e.target;
    
    // Toggle completed
    if (target.type === 'checkbox') {
        const id = target.getAttribute('data-id');
        const completed = target.checked;
        try {
            await fetch(`${API_BASE}/todos/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed })
            });
            await loadTodos();
        } catch (err) {
            showToast('Failed to update task');
        }
    }

    // Delete todo (Triggering Rust microservice via FastAPI)
    if (target.classList.contains('delete-btn')) {
        const id = target.getAttribute('data-id');
        target.disabled = true;
        target.textContent = 'Deleting...';

        try {
            const res = await fetch(`${API_BASE}/todos/${id}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            
            if (res.ok) {
                const handler = data.handled_by || 'Rust API';
                showToast(`Deleted! Handled by: ${handler}`);
                await loadTodos();
            } else {
                throw new Error(data.detail || 'Delete failed');
            }
        } catch (err) {
            showToast(`Delete failed: ${err.message}`);
            target.disabled = false;
            target.textContent = 'Delete';
        }
    }
});

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize Auth and Event Handlers
syncAuthState();
setInterval(checkRustWorker, 10000);
