# train_intents.py
# -*- coding: utf-8 -*-
import requests
import json
import os

API_URL = "http://localhost:8000/train_intents"
DATA_FILE = "train_intents.json"

def main():
    if not os.path.exists(DATA_FILE):
        print(f"❌ Arquivo {DATA_FILE} não encontrado. Crie-o antes de rodar este script.")
        return

    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    print(f"📤 Enviando intents de '{DATA_FILE}' para {API_URL} ...")
    try:
        resp = requests.post(API_URL, json=data)
        resp.raise_for_status()
        print("✅ Sucesso:", resp.json())
    except requests.exceptions.RequestException as e:
        print("❌ Erro na requisição:", e)
        if e.response is not None:
            try:
                print("Detalhes do erro:", e.response.json())
            except Exception:
                print("Resposta bruta:", e.response.text)

if __name__ == "__main__":
    main()
