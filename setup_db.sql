-- Jalankan file ini di psql sebagai superuser postgres
-- "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -f setup_db.sql

CREATE USER zaneva_user WITH ENCRYPTED PASSWORD 'zaneva_pass_dev';
CREATE DATABASE zaneva_ops OWNER zaneva_user;
GRANT ALL PRIVILEGES ON DATABASE zaneva_ops TO zaneva_user;
\c zaneva_ops
GRANT ALL ON SCHEMA public TO zaneva_user;
