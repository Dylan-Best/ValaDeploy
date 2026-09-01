ARG VITE_API_URL

# Étape 1 : Build avec Node.js
FROM node:20-alpine AS builder
WORKDIR /app

#On la transforme en variable d'environnement pour que Vite la voie
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

#Copie des dépendances
COPY package*.json ./

#Installation reproductible et rapide
RUN npm ci

#Copie du code source
COPY . .

#Build de production
RUN npm run build

#Étape 2 : Production avec Nginx (image légère ~25MB)
FROM nginx:alpine

#Copie des fichiers buildés depuis l'étape précédente
COPY --from=builder /app/dist /usr/share/nginx/html

#Configuration Nginx pour SPA (Single Page Application)
RUN echo 'server { 
    listen 80; 
    location / { 
        root /usr/share/nginx/html; 
        index index.html; 
        try_files $uri $uri/ /index.html; 
    } 
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]