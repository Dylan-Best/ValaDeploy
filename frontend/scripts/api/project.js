// scripts/api/project.js
// API pour les projets - FONCTIONS GLOBALES

function getProjects() {
    // Récupère la liste des projets de l'utilisateur
    return fetchWithAutoRefresh(function(token) {
        return fetch('http://app.localhost:8080/api/projects', {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        })
        .then(handleResponse); // handleResponse est dans auth.js
    });
}

function createProject(projectData) {
    // projectData = { slug, repo_url, branch, replica, envs_var }
    return fetchWithAutoRefresh(function(token) {
        return fetch('http://app.localhost:8080/api/deploy', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify(projectData)
        })
        .then(handleResponse);
    });
}
console.log('projects.js chargé, createProject =', typeof createProject);