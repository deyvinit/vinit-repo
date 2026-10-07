import os
import httpx
from typing import List
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .database import get_db, engine, Base
from . import models, schemas

# Create tables if not exists on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Todo Middleware API", version="1.0.0")

# Enable CORS for local dev / frontend container
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RUST_API_URL = os.getenv("RUST_API_URL", "http://rust-api:8080")

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "FastAPI Middleware"}

@app.get("/api/rust/status")
async def get_rust_status():
    """Forward status check to Rust API (whiteboard: 'hello world from Rust')"""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{RUST_API_URL}/")
            if resp.status_code == 200:
                return resp.json()
            raise HTTPException(status_code=resp.status_code, detail="Rust API returned non-200")
    except Exception as exc:
        return {
            "status": "warning",
            "message": f"Could not reach Rust API at {RUST_API_URL}: {str(exc)}"
        }

@app.get("/api/todos", response_model=List[schemas.TodoOut])
def read_todos(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Fetch todos from PostgreSQL"""
    todos = db.query(models.Todo).order_by(models.Todo.id.asc()).offset(skip).limit(limit).all()
    return todos

@app.post("/api/todos", response_model=schemas.TodoOut, status_code=status.HTTP_201_CREATED)
def create_todo(todo_in: schemas.TodoCreate, db: Session = Depends(get_db)):
    """Create a new todo in PostgreSQL"""
    db_todo = models.Todo(
        title=todo_in.title,
        description=todo_in.description or "",
        completed=False
    )
    db.add(db_todo)
    db.commit()
    db.refresh(db_todo)
    return db_todo

@app.put("/api/todos/{todo_id}", response_model=schemas.TodoOut)
def update_todo(todo_id: int, todo_in: schemas.TodoUpdate, db: Session = Depends(get_db)):
    """Update todo status or content in PostgreSQL"""
    db_todo = db.query(models.Todo).filter(models.Todo.id == todo_id).first()
    if not db_todo:
        raise HTTPException(status_code=404, detail="Todo not found")

    update_data = todo_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_todo, field, value)

    db.commit()
    db.refresh(db_todo)
    return db_todo

@app.delete("/api/todos/{todo_id}")
async def delete_todo_via_rust(todo_id: int):
    """
    Bonus requirement: Deletion is delegated to and executed by the Rust API microservice.
    FastAPI acts as reverse proxy / delegator.
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.delete(f"{RUST_API_URL}/todos/{todo_id}")
            if resp.status_code == 200:
                return resp.json()
            elif resp.status_code == 404:
                raise HTTPException(status_code=404, detail=f"Todo {todo_id} not found by Rust API")
            else:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to communicate with Rust deletion service: {str(exc)}"
        )

