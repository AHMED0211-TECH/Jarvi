from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
import os
from supabase import create_client, Client
from dotenv import load_dotenv
import json

load_dotenv()

supabase: Client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_KEY")
)


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = Groq(api_key=os.getenv("Groq_Api_Key"))

class ExtractTestRequest(BaseModel):
    user_message: str
    assistant_reply: str

@app.post("/test-extract")
def test_extract(request: ExtractTestRequest):
    return extract_memories(request.user_message, request.assistant_reply)


class ChatRequest(BaseModel):
    message: str
    device_id:str


def get_or_create_user(device_id: str):
    existing = supabase.table("users").select("*").eq("device_token", device_id).execute()

    if existing.data:
        return existing.data[0]

    new_user = supabase.table("users").insert({"device_token": device_id}).execute()
    return new_user.data[0]    

def get_memories(user_id: str):
    result = supabase.table("memories").select("fact").eq("user_id",user_id).execute()
    return [row["fact"] for row in result.data]

def add_memory(user_id: str, fact: str):
    supabase.table("memories").insert({"user_id":user_id, "fact":fact}).execute()

def extract_memories(user_message : str, assistant_reply : str):
    extraction_prompt = (
        "Read the exachange between user and assistant. "
        "List any durable long-term facts about the user worth remembering in future conversations. "
        "(name, preference, ongoing projects, important context)."
        "Ignore small talks and one-off question."
        "Respond only with JSON array of short string, no extra text."
        "If nothing worth remembering, reply with empty array: []\n\n"
         f"User said: {user_message}\n"
        f"Assistant replied: {assistant_reply}"
    )

    result = client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[{"role": "user", "content": extraction_prompt}],
        max_tokens=300,
    )

    raw = result.choices[0].message.content
    print("RAW MODEL OUTPUT:", raw)

    try:
        facts = json.loads(raw)
        if isinstance(facts, list):
            return facts
    except Exception:
        pass

    return []
        

@app.get("/test-user/{device_id}")
def test_user(device_id: str ):
    return get_or_create_user(device_id)

@app.get("/test-memories/{user_id}")
def test_memories(user_id:str):
    return get_memories(user_id)

@app.get("/test-add-memory/{user_id}/{fact}")
def test_add_memory(user_id: str, fact: str):
    add_memory(user_id, fact)
    return get_memories(user_id)


@app.post("/chat")
def chat(request: ChatRequest):
    user = get_or_create_user(request.device_id)
    memories = get_memories(user["id"])

    if memories:
        memory_text = "Here is what you remember about this user: " + "; ".join(memories)
    else:
        memory_text = "You don't have any saved memories about this user yet."

    result = client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[
            {"role": "system", "content": f"You are Jarvi, a helpful voice assistant. {memory_text}"},
            {"role": "user", "content": request.message},
        ],
        max_tokens=200,
    )
    reply = result.choices[0].message.content
    
    new_facts = extract_memories(request.message, reply)
    for fact in new_facts:
        add_memory(user["id"], fact)

    return {"response": reply}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)