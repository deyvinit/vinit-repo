import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db

# Use in-memory SQLite for isolated unit testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base.metadata.create_all(bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

def test_create_and_read_todo():
    # Create todo
    payload = {"title": "Test Todo", "description": "Testing description"}
    post_resp = client.post("/api/todos", json=payload)
    assert post_resp.status_code == 201
    data = post_resp.json()
    assert data["title"] == "Test Todo"
    assert data["completed"] is False
    todo_id = data["id"]

    # Read todos
    get_resp = client.get("/api/todos")
    assert get_resp.status_code == 200
    todos = get_resp.json()
    assert len(todos) >= 1

    # Update todo
    put_resp = client.put(f"/api/todos/{todo_id}", json={"completed": True})
    assert put_resp.status_code == 200
    assert put_resp.json()["completed"] is True
