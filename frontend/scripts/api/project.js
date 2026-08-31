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

function getDeployStatus(projectId) {
    // Récupère le statut d'un déploiement en cours
    return fetchWithAutoRefresh(function(token) {
        return fetch(`http://app.localhost:8080/api/deploy/${projectId}/status`, {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        })
        .then(handleResponse);
    });
}

function getDashboardStats() {
    // Récupère les statistiques agrégées (total, running, failed, % vulns)
    return fetchWithAutoRefresh(function(token) {
        return fetch('http://app.localhost:8080/api/projects/dashboard/stats', {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        })
        .then(handleResponse);
    });
}

// ---------- STACKS ----------

function getStacks() {
    // Récupère la liste résumée de toutes les stacks de l'utilisateur (1 ligne/stack)
    return fetchWithAutoRefresh(function(token) {
        return fetch('http://app.localhost:8080/api/deploy/stacks', {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        })
        .then(handleResponse);
    });
}

function getStackDetail(projectId) {
    // Récupère le détail des composants d'une stack (statut individuel front/back/database)
    return fetchWithAutoRefresh(function(token) {
        return fetch(`http://app.localhost:8080/api/deploy/stack/${projectId}/status`, {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        })
        .then(handleResponse);
    });
}
