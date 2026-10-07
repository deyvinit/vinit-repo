-- Database initialization script for Todo App

CREATE TABLE IF NOT EXISTS todos (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed initial todos
INSERT INTO todos (title, description, completed) VALUES
    ('Launch AWS EC2 instance', 'Deploy 5 containers with docker-compose', true),
    ('Configure Keycloak Auth', 'Preload realm and test user', false),
    ('Test Rust DELETE microservice', 'Verify polyglot DELETE proxy requirement', false);

