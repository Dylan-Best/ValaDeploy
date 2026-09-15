#!/bin/sh
set -e

echo " Démarrage de l'application Laravel..."

# 1. Lancer les migrations (le --force est obligatoire car l'environnement est considéré comme 'production')
echo " Exécution des migrations de la base de données..."
php artisan migrate --force

# 2. Démarrer Nginx en arrière-plan
echo " Démarrage de Nginx..."
nginx

# 3. Démarrer PHP-FPM au premier plan (pour garder le conteneur actif)
echo " Démarrage de PHP-FPM..."
php-fpm