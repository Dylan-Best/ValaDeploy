// scripts/api/pipeline.js
// API pour le suivi du pipeline de déploiement (stack ou mono-projet).
//
// HYPOTHESES A VERIFIER / AJUSTER selon le backend réel :
// - Endpoint de statut : GET /api/deploy/pipeline/{project_id}
//   Réponse attendue :
//   {
//     project: { id, slug, environment, commit_sha, commit_message, live_url },
//     status: "running" | "success" | "failed" | "cancelled",
//     steps: [
//       { id: "source", label: "Source Control", description: "...", status: "completed"|"active"|"pending"|"failed", duration_seconds: 12 }
//     ],
//     logs: ["ligne 1", "ligne 2", ...]   // tableau complet et croissant à chaque poll
//   }
// - Annulation : POST /api/deploy/pipeline/{project_id}/cancel
// - Relance   : POST /api/deploy/pipeline/{project_id}/retry

function getPipelineStatus(projectId) {
    return fetchWithAutoRefresh(function(token) {
        return fetch('http://app.localhost:8080/api/deploy/pipeline/' + projectId, {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + token
            }
        })
        .then(handleResponse);
    });
}

function cancelBuild(projectId) {
    return fetchWithAutoRefresh(function(token) {
        return fetch('http://app.localhost:8080/api/deploy/pipeline/' + projectId + '/cancel', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token
            }
        })
        .then(handleResponse);
    });
}

function retryBuild(projectId) {
    return fetchWithAutoRefresh(function(token) {
        return fetch('http://app.localhost:8080/api/deploy/pipeline/' + projectId + '/retry', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token
            }
        })
        .then(handleResponse);
    });
}
