const API_BASE = '/api';

const todoList = document.getElementById('todo-list');
const todoForm = document.getElementById('todo-form');
const titleInput = document.getElementById('todo-title');
const descInput = document.getElementById('todo-desc');
const rustBadge = document.getElementById('rust-badge');
const loadingText = document.getElementById('loading');
const toast = document.getElementById('toast');

// Show notification toast
function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3500);
}

// Fetch Rust Worker Status
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

// Fetch and render Todos
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

// Add new todo
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

// Event delegation for toggle and delete
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

// Initial load
checkRustWorker();
loadTodos();
setInterval(checkRustWorker, 10000);

