--tabla CATEGORIA
CREATE TABLE IF NOT EXISTS CATEGORIA (
    id_categoria SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL
);

--tabla PRODUCTO
CREATE TABLE IF NOT EXISTS PRODUCTO (
    id_producto SERIAL PRIMARY KEY,
    id_categoria INT REFERENCES CATEGORIA(id_categoria),
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    precio_unitario NUMERIC(10, 2) NOT NULL,
    imagen_url VARCHAR(255),
    activo BOOLEAN DEFAULT TRUE
);

--tabla INVENTARIO
CREATE TABLE IF NOT EXISTS INVENTARIO (
    id_inventario SERIAL PRIMARY KEY,
    id_producto INT UNIQUE REFERENCES PRODUCTO(id_producto),
    stock_actual INT NOT NULL CHECK (stock_actual >= 0),
    stock_critico INT NOT NULL DEFAULT 20
);

-- INSERCIÓN DE DATOS INICIALES
INSERT INTO CATEGORIA (nombre) VALUES ('Panes Salados'), ('Empanadas');

INSERT INTO PRODUCTO (id_categoria, nombre, descripcion, precio_unitario) VALUES
(1, 'Pan de Completo (Bolsa 10 un.)', 'Pan fresco ideal para completadas', 2500),
(1, 'Marraqueta Tradicional (1 Kg)', 'Crujiente marraqueta recién horneada', 1800),
(2, 'Empanada de Pino Horno', 'Empanada de pino tradicional', 2000);

INSERT INTO INVENTARIO (id_producto, stock_actual, stock_critico) VALUES
(1, 15, 20),
(2, 85, 20),
(3, 0, 10);