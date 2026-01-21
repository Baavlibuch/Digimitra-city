import urllib.request
import urllib.parse
import json
import ssl

BASE_URL = "http://localhost:8000/api/v1"

def log(msg, status="INFO"):
    print(f"[{status}] {msg}")

def make_request(url, method="GET", data=None, headers=None):
    if headers is None:
        headers = {}
    
    if data:
        data = json.dumps(data).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as response:
            return {
                "status": response.status,
                "body": json.loads(response.read().decode('utf-8'))
            }
    except urllib.error.HTTPError as e:
        return {
            "status": e.code,
            "body": json.loads(e.read().decode('utf-8')) if e.read() else str(e)
        }
    except Exception as e:
        log(f"Request failed: {e}", "ERROR")
        return None

def test_auth():
    log("Testing Auth...")
    # Login to get token
    # Note: The token endpoint specifically expects form data, not JSON
    url = f"{BASE_URL}/token"
    data = urllib.parse.urlencode({
        "username": "admin",
        "password": "admin"
    }).encode('utf-8')
    
    req = urllib.request.Request(url, data=data, method="POST")
    # Default Content-Type for urlencode is application/x-www-form-urlencoded, which is correct
    
    try:
        with urllib.request.urlopen(req) as response:
            body = json.loads(response.read().decode('utf-8'))
            log("Login Successful", "SUCCESS")
            return body["access_token"]
    except urllib.error.HTTPError as e:
        log(f"Login Failed: {e.code} {e.read().decode('utf-8')}", "ERROR")
        return None
    except Exception as e:
        log(f"Login Failed: {e}", "ERROR")
        return None

def test_users(token):
    log("Testing User Management...")
    headers = {"Authorization": f"Bearer {token}"}
    
    new_user = {
        "username": "test_operator",
        "password": "password123",
        "role": "operator"
    }
    
    resp = make_request(f"{BASE_URL}/users", "POST", new_user, headers)
    
    if resp:
        if resp["status"] == 201:
            log("User Created", "SUCCESS")
        elif resp["status"] == 400 and "already registered" in str(resp["body"]):
             log("User already exists", "SUCCESS")
        else:
            log(f"Create User Failed: {resp['status']} {resp['body']}", "ERROR")

def test_cameras(token):
    log("Testing Camera Management...")
    headers = {"Authorization": f"Bearer {token}"}
    
    new_camera = {
        "name": "Front Gate",
        "location": "Entrance",
        "latitude": 12.9716,
        "longitude": 77.5946
    }
    
    resp = make_request(f"{BASE_URL}/cameras", "POST", new_camera, headers)
    
    if resp and resp["status"] in [201, 200]:
        log("Camera Created", "SUCCESS")
        cam_id = resp["body"]["id"]
        
        # List cameras
        list_resp = make_request(f"{BASE_URL}/cameras", "GET", None, headers)
        if list_resp and list_resp["status"] == 200 and len(list_resp["body"]) > 0:
            log(f"List Cameras Successful using ID: {cam_id}", "SUCCESS")
        else:
            log("List Cameras Failed", "ERROR")
    else:
         log(f"Create Camera Failed: {resp['status'] if resp else 'None'} {resp['body'] if resp else ''}", "ERROR")

def test_ai(token):
    log("Testing AI Service...")
    headers = {"Authorization": f"Bearer {token}"}
    
    resp = make_request(f"{BASE_URL}/ai/ask", "POST", {"query": "Show me red cars"}, headers)
    
    if resp and resp["status"] == 200:
        log("AI Ask Successful", "SUCCESS")
    else:
        log(f"AI Ask Failed: {resp['status'] if resp else 'None'} {resp['body'] if resp else ''}", "ERROR")

if __name__ == "__main__":
    print("--- Starting API Verification ---")
    token = test_auth()
    if token:
        test_users(token)
        test_cameras(token)
        test_ai(token)
    print("--- Verification Complete ---")
