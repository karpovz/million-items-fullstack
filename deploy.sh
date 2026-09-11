#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
trap 'printf "Ошибка развёртывания на строке %s.\n" "$LINENO" >&2' ERR

as_root() {
  if (( EUID == 0 )); then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    echo "Для установки и запуска Docker нужны root или sudo." >&2
    exit 1
  fi
}

if [[ ! -f compose.yaml || ! -f Dockerfile ]]; then
  echo "Скрипт должен находиться в корне клонированного репозитория." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  if [[ ! -f /etc/os-release ]]; then
    echo "Установите Docker Engine и Docker Compose, затем повторите запуск." >&2
    exit 1
  fi
  source /etc/os-release
  case "${ID:-}" in
    ubuntu|debian) ;;
    *)
      echo "Автоматическая установка Docker поддерживает только Ubuntu и Debian." >&2
      exit 1
      ;;
  esac

  echo "Устанавливаю Docker из официального репозитория…"
  as_root apt-get update
  as_root apt-get install -y ca-certificates curl
  as_root install -m 0755 -d /etc/apt/keyrings
  as_root curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
  as_root chmod a+r /etc/apt/keyrings/docker.asc
  as_root tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/$ID
Suites: ${UBUNTU_CODENAME:-${VERSION_CODENAME:?Не определена версия ОС}}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
  as_root apt-get update
  if command -v docker >/dev/null 2>&1; then
    as_root apt-get install -y docker-buildx-plugin docker-compose-plugin
  else
    as_root apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi
  as_root systemctl enable --now docker
fi

docker_cmd=(docker)
if ! docker info >/dev/null 2>&1; then
  as_root systemctl enable --now docker
  if (( EUID != 0 )); then
    docker_cmd=(sudo docker)
  fi
  "${docker_cmd[@]}" info >/dev/null
fi

compose() {
  "${docker_cmd[@]}" compose --project-name million-items --file compose.yaml "$@"
}

compose config --quiet
echo "Собираю приложение…"
compose build
echo "Запускаю приложение и жду готовности…"
if ! compose up --detach --wait --wait-timeout 120; then
  compose ps --all || true
  compose logs --tail 80 app || true
  echo "Приложение не запустилось. Проверьте ошибки выше и доступность порта 3000." >&2
  exit 1
fi

echo "Приложение запущено: http://<IP-сервера>:3000"
echo "Контейнер настроен на автоматический перезапуск после перезагрузки сервера."
echo "Для обновления кода выполните git pull и снова bash deploy.sh."
echo "При пересоздании контейнера выбор и добавленные ID сбрасываются: данные хранятся в памяти."
