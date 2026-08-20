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
    .then(response => {
      if (!response.ok) {
        // on lit le body maintenant, PENDANT qu'on peut encore le faire
        return response.json().then(errorBody => {
          throw new Error(extractErrorMessage(errorBody));
        });
      }
      return response.json();
    }) // reponse http brute pas le corps
    .then(data => data);
}


function loginUser(email, password) {
  return fetch("http://app.localhost:8080/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include", // indispensable pour que le cookie refresh_token soit accepté/stocké
    body: JSON.stringify({ email, password })
  })
    .then(response => {
      if (!response.ok) {
        return response.json().then(errorBody => {
          throw new Error(extractErrorMessage(errorBody));
        });
      }
      return response.json();
    })
    .then(data => data);
}