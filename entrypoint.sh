#!/bin/sh
set -e

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
while ! nc -z $DB_HOST $DB_PORT; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 1
done
echo "PostgreSQL is up - executing command"

python3 manage.py migrate --noinput
python3 create_default_user.py
python3 manage.py collectstatic --noinput
exec "$@"
