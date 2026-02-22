#!/usr/bin/env python3

import jwt
import json

# JWT tokens from the test
token1 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoidXNlcl82ODI0NzI3Y2QwZmEiLCJleHAiOjE3NzIzMzcwMTIsImlhdCI6MTc3MTczMjIxMn0.J_4awNHK0D6u0Nn1Kt_ZK4E88bg5AKz84Pf0MRtOhuU"
token2 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoidXNlcl84YWJhZDZkZmIwOGYiLCJleHAiOjE3NzIzMzcwMTIsImlhdCI6MTc3MTczMjIxMn0.7cdlaC03sFwbC8F-lPqILofh35qSKQB_sMj_E4bg0sA"

JWT_SECRET = 'scambio-favori-secret-key-2025'

print("Decoding User 1 token:")
try:
    payload1 = jwt.decode(token1, JWT_SECRET, algorithms=["HS256"])
    print(json.dumps(payload1, indent=2))
except Exception as e:
    print(f"Error: {e}")

print("\nDecoding User 2 token:")
try:
    payload2 = jwt.decode(token2, JWT_SECRET, algorithms=["HS256"])
    print(json.dumps(payload2, indent=2))
except Exception as e:
    print(f"Error: {e}")