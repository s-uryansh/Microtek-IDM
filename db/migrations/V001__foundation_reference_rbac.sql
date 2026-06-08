CREATE TABLE IF NOT EXISTS warehouse (
    warehouse_id BIGSERIAL PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('PLANT','CENTRAL','REGIONAL')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(60) NOT NULL,
    updated_at TIMESTAMPTZ,
    updated_by VARCHAR(60)
);

CREATE TABLE IF NOT EXISTS product (
    product_id BIGSERIAL PRIMARY KEY,
    product_code VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(160) NOT NULL,
    segment VARCHAR(40) NOT NULL,
    is_battery BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(60) NOT NULL,
    updated_at TIMESTAMPTZ,
    updated_by VARCHAR(60)
);

CREATE TABLE IF NOT EXISTS role (
    role_id BIGSERIAL PRIMARY KEY,
    code VARCHAR(60) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(60) NOT NULL,
    updated_at TIMESTAMPTZ,
    updated_by VARCHAR(60)
);

CREATE TABLE IF NOT EXISTS role_permission (
    role_permission_id BIGSERIAL PRIMARY KEY,
    role_id BIGINT NOT NULL REFERENCES role(role_id),
    permission_code VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(60) NOT NULL,
    UNIQUE (role_id, permission_code)
);

CREATE TABLE IF NOT EXISTS app_user (
    app_user_id BIGSERIAL PRIMARY KEY,
    external_ref VARCHAR(80) UNIQUE,
    username VARCHAR(80) NOT NULL UNIQUE,
    display_name VARCHAR(160) NOT NULL,
    role_id BIGINT NOT NULL REFERENCES role(role_id),
    default_warehouse_id BIGINT REFERENCES warehouse(warehouse_id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(60) NOT NULL,
    updated_at TIMESTAMPTZ,
    updated_by VARCHAR(60)
);

CREATE TABLE IF NOT EXISTS app_user_warehouse (
    app_user_warehouse_id BIGSERIAL PRIMARY KEY,
    app_user_id BIGINT NOT NULL REFERENCES app_user(app_user_id),
    warehouse_id BIGINT NOT NULL REFERENCES warehouse(warehouse_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by VARCHAR(60) NOT NULL,
    UNIQUE (app_user_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS ix_app_user_role ON app_user(role_id);
CREATE INDEX IF NOT EXISTS ix_app_user_warehouse_user ON app_user_warehouse(app_user_id);
