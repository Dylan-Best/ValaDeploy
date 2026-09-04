// scripts/api/pipeline.js

function getPipelineStatus(projectId) {
    return fetchWithAutoRefresh(function(token) {
        return fetch('http://app.localhost:8080/api/deploy/' + projectId + '/pipeline', {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + token
            }
        }).then(handleResponse);
    });
}

function cancelBuild(projectId) {
    return fetchWithAutoRefresh(function(token) {
        return fetch('http://app.localhost:8080/api/deploy/' + projectId + '/cancel', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token
            }
        }).then(handleResponse);
    });
}

function retryBuild(projectId) {
    return fetchWithAutoRefresh(function(token) {
        return fetch('http://app.localhost:8080/api/deploy/' + projectId + '/retry', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token
            }
        }).then(handleResponse);
    });
}