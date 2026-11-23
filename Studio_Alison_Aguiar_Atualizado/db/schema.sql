-- =========================================================
-- STUDIO ALISON AGUIAR - BANCO DE DADOS MYSQL
-- =========================================================

CREATE DATABASE IF NOT EXISTS studio_alison_aguiar
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE studio_alison_aguiar;

-- =========================================================
-- 1. SERVIÇOS
-- =========================================================

CREATE TABLE IF NOT EXISTS services (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    price_cents INT NOT NULL,
    duration_min INT NOT NULL DEFAULT 30,
    active TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,

    CONSTRAINT chk_services_price
        CHECK (price_cents >= 0),

    CONSTRAINT chk_services_duration
        CHECK (duration_min BETWEEN 5 AND 240),

    CONSTRAINT chk_services_active
        CHECK (active IN (0, 1))
) ENGINE = InnoDB;


-- =========================================================
-- 2. CONFIGURAÇÕES DO SISTEMA
-- =========================================================

CREATE TABLE IF NOT EXISTS settings (
    `key` VARCHAR(100) PRIMARY KEY,
    `value` TEXT NOT NULL
) ENGINE = InnoDB;


-- =========================================================
-- 3. DATAS FECHADAS
-- =========================================================

CREATE TABLE IF NOT EXISTS closed_dates (
    `date` DATE PRIMARY KEY,
    reason VARCHAR(255)
) ENGINE = InnoDB;


-- =========================================================
-- 4. AGENDAMENTOS
-- =========================================================

CREATE TABLE IF NOT EXISTS appointments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    `date` DATE NOT NULL,
    `time` TIME NOT NULL,
    duration_min INT NOT NULL DEFAULT 30,
    total_cents INT NOT NULL,

    payment_method ENUM('pix', 'later') NOT NULL,
    payment_status ENUM('pending', 'paid')
        NOT NULL DEFAULT 'pending',

    status ENUM('booked', 'cancelled', 'completed')
        NOT NULL DEFAULT 'booked',

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Colunas geradas para controlar horários ativos.
    -- Agendamentos cancelados retornam NULL nestas colunas,
    -- permitindo que o horário seja reservado novamente.

    active_slot_date DATE
        GENERATED ALWAYS AS (
            CASE
                WHEN status <> 'cancelled' THEN `date`
                ELSE NULL
            END
        ) STORED,

    active_slot_time TIME
        GENERATED ALWAYS AS (
            CASE
                WHEN status <> 'cancelled' THEN `time`
                ELSE NULL
            END
        ) STORED,

    -- Impede dois agendamentos ativos no mesmo horário.
    UNIQUE KEY ux_appointments_active_slot (
        active_slot_date,
        active_slot_time
    ),

    -- Índices para otimizar consultas.
    INDEX ix_appointments_date (`date`, `time`),
    INDEX ix_appointments_phone (phone),

    CONSTRAINT chk_appointments_total
        CHECK (total_cents >= 0)

) ENGINE = InnoDB;


-- =========================================================
-- 5. SERVIÇOS VINCULADOS AO AGENDAMENTO
-- Guarda o nome e o preço do serviço no momento da reserva.
-- =========================================================

CREATE TABLE IF NOT EXISTS appointment_services (
    appointment_id INT UNSIGNED NOT NULL,
    service_id VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    price_cents INT NOT NULL,

    PRIMARY KEY (appointment_id, service_id),

    CONSTRAINT fk_appointment_services_appointment
        FOREIGN KEY (appointment_id)
        REFERENCES appointments(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_appointment_services_service
        FOREIGN KEY (service_id)
        REFERENCES services(id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_appointment_services_price
        CHECK (price_cents >= 0)

) ENGINE = InnoDB;


-- =========================================================
-- 6. DADOS INICIAIS - SERVIÇOS
-- =========================================================

INSERT IGNORE INTO services
    (id, name, price_cents, duration_min, sort_order)
VALUES
    ('degrade', 'Corte degradê', 4000, 30, 1),
    ('barba', 'Barba', 1500, 30, 2),
    ('zero', 'Raspar na zero', 2500, 30, 3);


-- =========================================================
-- 7. CONFIGURAÇÕES INICIAIS
-- =========================================================

INSERT IGNORE INTO settings (`key`, `value`)
VALUES
    ('openDays', '[1,2,3,4,5,6]'),
    ('openTime', '09:00'),
    ('closeTime', '18:00'),
    ('slotMinutes', '30');