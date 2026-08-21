// scripts/api/auth.js
// Fonctions d'appel à l'API d'authentification (register, login...)
function extractErrorMessage(errorBody) {
  const detail = errorBody.detail;

  if (typeof detail === "string") {
    // Cas HTTPException(detail="...") -> déjà une string simple
    return detail;
  }

  if (Array.isArray(detail)) {
    // Cas erreur Pydantic (422) -> liste d'objets {loc, msg, ...}
    // .map() transforme chaque erreur en une ligne "champ: message"
    // .join("\n") assemble le tableau en une seule string, une erreur par ligne
    return detail
      .map(err => `${err.loc[err.loc.length - 1]}: ${err.msg}`)
      .join("\n");
  }

  return "Une erreur est survenue.";
}

// Fonction commune : transforme une réponse fetch en JSON,
// ou lance une erreur (avec le status HTTP attaché) si ça a échoué
function handleResponse(response) {
  if (!response.ok) {
    return response.json().then(errorBody => {
      const error = new Error(extractErrorMessage(errorBody));
      error.status = response.status; // utile pour le code de refresh token
      throw error;
    });
  }
  return response.json();
}

function registerUser(fullname, email, password, confirmPassword) {
  return fetch("http://app.localhost:8080/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json" // pour indiquer le type de donne a envoyer
    },
    body: JSON.stringify({ 
        full_name : fullname, 
        email: email, 
        password: password, 
        confirm_password: confirmPassword }) 
  })
    .then(handleResponse)
   // reponse http brute pas le corps
    .then(data => data);
}


function loginUser(email, password) {
  return fetch("http://app.localhost:8080/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include", // indispensable pour que le cookie refresh_token soit accepté/stocké
    body: JSON.stringify({ email, password })
  })
    .then(handleResponse)
    .then(data => data);
}


function refreshAccessToken() {
  return fetch("http://app.localhost:8080/auth/refresh", {
    method: "POST",
    credentials: "include"
  })
    .then(handleResponse);
}

function getCurrentUser(accessToken) {
  return fetch("http://app.localhost:8080/auth/me", {
    method: "GET",
    headers: {
      "Authorization": "Bearer " + accessToken // n'utilise pas le cookies, mais le header(convention)
    }
  })
    .then(handleResponse);
}