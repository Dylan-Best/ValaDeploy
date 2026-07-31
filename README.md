```markdown
# 🚀 ValaPaaS (Vala Platform-as-a-Service)

> **Internal Developer Platform (IDP) On-Premise simplifiée, axée sur la sécurité et la facilité d'utilisation pour les équipes non-DevOps.**

[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688.svg)](https://fastapi.tiangolo.com/)
[![Docker](https://img.shields.io/badge/Docker-Engine-2496ED.svg)](https://www.docker.com/)
[![DevSecOps](https://img.shields.io/badge/Security-Trivy_Integrated-green.svg)](https://trivy.dev/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 📌 Présentation

**ValaDeploy** (*"Vala"* signifiant enclos/espace protégé en malgache) est un mini-PaaS On-Premise conçu pour abstraire la complexité de l'infrastructure Docker et du réseau. Il permet à tout développeur de déployer une application Web en quelques clics à partir d'un dépôt Git, tout en garantissant un contrôle de sécurité automatisé avant chaque mise en production.

---

## ✨ Fonctionnalités Clés

- **📦 Déploiement Git Simplifié :** Renseignez l'URL Git d'un projet (React, Laravel, FastAPI, etc.), ValaDeploy s'occupe du clonnage et du build Docker.
- **🛡️ DevSecOps par Défaut :** Scan automatique des vulnérabilités de l'image et des dépendances via **Trivy** avant le lancement. Blocage automatique si une faille critique est détectée.
- **🌐 Routage & DNS Automatiques :** Intégration native avec **Traefik** et support DNS wildcard local (`*.sslip.io`) pour accéder immédiatement aux applications via un sous-domaine dédié.
- **📊 Streaming des Logs en Direct :** Visualisation des logs du conteneur en temps réel depuis le dashboard Web.
- **🔐 Gestion des Variables d'Environnement :** Injection sécurisée de variables et secrets (`.env`) sans accès SSH au serveur.
- **⚙️ Scaling Manuel d'Instances :** Ajustement dynamique du nombre de répliques d'une application avec répartition de charge (Load Balancing) gérée par Traefik.

---

## 🏗️ Architecture Technique

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                           DASHBOARD & API (FastAPI)                       │
└────────┬───────────────────────────┬───────────────────────────┬──────────┘
         │                           │                           │
         ▼                           ▼                           ▼
┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│    GitPython     │        │    Trivy CLI     │        │  Docker SDK Py   │
│   (Git Clone)    │ ─────> │  (Security Scan) │ ─────> │ (Build & Deploy) │
└──────────────────┘        └──────────────────┘        └────────┬─────────┘
                                                                 │
                                                                 ▼
                                                        ┌──────────────────┐
                                                        │  Traefik Proxy   │
                                                        │  (*.sslip.io)    │
                                                        └──────────────────┘

```

---

## 🧰 Stack Technique

* **Backend / Orchestrateur :** Python 3.11+, FastAPI, Docker SDK for Python (`docker-py`), GitPython.
* **Base de données :** SQLite (Développement) / PostgreSQL (Production).
* **Reverse Proxy :** Traefik v2.x.
* **Moteur de Sécurité :** Trivy / Gitleaks.
* **Frontend :** HTML5, TailwindCSS, Server-Sent Events (SSE) pour le streaming de logs.

---

## 🚀 Démarrage Rapide

### Prérequis

* **Docker Engine** & **Docker Compose** installés sur la machine hôte.
* **Python 3.11+** installé.
* **Traefik** en cours d'exécution sur le port 80/443.

### 1. Installation du projet

```bash
# Cloner le dépôt ValaDeploy
git clone [https://github.com/Dylan-Best/ValaDeploy.git](https://github.com/Dylan-Best/ValaDeploy.git)
cd ValaDeploy

# Créer un environnement virtuel Python
python3 -m venv venv
source venv/bin/activate

# Installer les dépendances
pip install -r requirements.txt

```

### 2. Configuration des variables d'environnement

Créez un fichier `.env` à la racine du projet :

```env
APP_NAME="ValaDeploy"
PORT=8000
SERVER_IP="<ip_serveur>" # Remplacez par l'IP de votre serveur local
WILDCARD_DOMAIN="sslip.io"
DOCKER_NETWORK="ValaDeploy-network"

```

### 3. Lancement de l'application

```bash
# S'assurer que le réseau Docker partagé existe
docker network create ValaDeploy-network

# Lancer l'API et le Dashboard
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

```

L'interface Web de **ValaDeploy** est maintenant accessible sur `http://localhost:8000` (ou `http://<IP_SERVEUR>:8000`).

---

## 📁 Structure du Projet

```text
ValaDeploy/
├── backend/
│   ├── app/
│   │   ├── main.py                 # Point d'entrée FastAPI
│   │   ├── api/
│   │   │   ├── routes_projects.py
│   │   │   ├── routes_deploy.py
│   │   │   ├── routes_logs.py
│   │   │   └── routes_security.py
│   │   ├── core/
│   │   │   ├── config.py           # Variables d'env, settings (pydantic-settings)
│   │   │   ├── security.py         # Auth (JWT/session)
│   │   │   └── docker_client.py    # Wrapper docker-py
│   │   ├── services/
│   │   │   ├── git_service.py      # GitPython : clone, pull, detect
│   │   │   ├── build_service.py    # Génération Dockerfile / build image
│   │   │   ├── scan_service.py     # Intégration Trivy / Gitleaks (subprocess)
│   │   │   ├── traefik_service.py  # Génération labels/config dynamique
│   │   │   └── logs_service.py     # Streaming logs (WebSocket)
│   │   ├── models/
│   │   │   ├── project.py          # Modèles SQLAlchemy/Pydantic
│   │   │   ├── deployment.py
│   │   │   └── user.py
│   │   ├── db/
│   │   │   ├── database.py
│   │   │   └── migrations/         # Alembic
│   │   └── websockets/
│   │       └── log_stream.py
│   ├── tests/
│   │   ├── unit/
│   │   └── integration/
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── templates/                  # Jinja2 (si FastAPI + Tailwind)
│   │   ├── base.html
│   │   ├── dashboard.html
│   │   ├── project_detail.html
│   │   └── logs.html
│   ├── static/
│   │   ├── css/ (Tailwind build)
│   │   └── js/ (fetch API, websocket client)
│   └── (ou dossier react-app/ si SPA légère)
├── infra/
│   ├── docker-compose.yml          # Stack complète : app + traefik + db
│   ├── traefik/
│   │   ├── traefik.yml
│   │   └── dynamic_conf.yml
│   └── scripts/
│       ├── install.sh
│       └── bootstrap_server.sh
├── docs/
│   ├── memoire/                    # Rédaction du mémoire (chapitres .md ou .docx)
│   ├── architecture.md
│   └── captures/                   # Screenshots pour la soutenance
├── .env.example
├── .gitignore
└── README.md

```

---

## 🎯 Feuille de Route (Roadmap)

* [x] MVP : Clone Git, Build Docker, Déploiement basique
* [x] Intégration du scanner de sécurité Trivy au build
* [x] Assignation automatique de sous-domaines via Traefik
* [ ] Support des bases de données managées en 1-clic (PostgreSQL / Redis)
* [ ] Module d'export/backup de volumes persistants
* [ ] Driver d'extension multi-nœuds (Docker Swarm / K3s)

---

## 👤 Auteur

* **Dylan-Best** — *Conception & Développement (Mémoire de Fin d'Études)*

---

## 📄 Licence

Ce projet est sous licence MIT - voir le fichier [LICENSE](https://www.google.com/search?q=LICENSE) pour plus de détails.

