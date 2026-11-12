Proyecto Capstone: Sistema de Gestión de Pedidos e Inventario - Matteo Masas
ARCHIVO README

Asignatura / Sección: 2026_2_MA_CAPSTONE_005D
Grupo: GRUPO_6
Institución: DUOC UC SEDE MAIPÚ

📋 Descripción del Proyecto
El presente proyecto corresponde al desarrollo de una solución tecnológica orientada a la digitalización de procesos de venta y gestión operativa para la amasandería local Matteo Masas (Padre Hurtado). El sistema resuelve la problemática del manejo de stock en negocios que trabajan bajo una modalidad de producción a pedido del día, permitiendo a los clientes realizar encargos y compras en línea sin bloquear el flujo por restricciones de inventario estático. Desarrollado sobre una arquitectura de tres capas (PostgreSQL, Node.js/Express y HTML/CSS/JS Vanilla), el sistema busca optimizar la recepción de órdenes diarias, mejorar la visibilidad del catálogo de productos y facilitar la administración operativa del establecimiento.

   Thomas Alexander Puma Valdebenito
Backend Developer & DB Architect
th.puma@duocuc.cl

   Alyson Cuevas
Frontend Developer & UX/UI
aly.cuevas@duocuc.cl

📁 Estructura del Repositorio
La organización de carpetas y artefactos sigue la estructura definida para la sección 2026_2_MA_CAPSTONE_005D:
2026_2_MA_CAPSTONE_005D_GRUPO_6/
│
├── Fase 1/
│ ├── Evidencias Grupales/   # Informes, propuestas, actas de reunión y entregables grupales de la Fase 1
│ └── Evidencias Individuales/ # Bitácoras, aportes y evaluaciones individuales de la Fase 1
│
├── Fase 2/
│ ├── Evidencias Grupales/   # Informes de avance y entregables grupales de la Fase 2
│ ├── Evidencias Individuales/ # Bitácoras y avances individuales de la Fase 2
│ └── Evidencias Proyecto/
│   ├── Evidencias de documentación/ # Requisitos, diagramas UML, arquitectura, modelo de BD, manuales, etc.
│   └── Evidencias de sistema/   # Código fuente, scripts de BD, archivos de configuración del software
│
└── Fase 3/
  ├── Evidencias Grupales/   # Informe final, presentación y entregables grupales de la Fase 3
  └── Evidencias Individuales/ # Evaluaciones finales y bitácoras individuales de la Fase 3
 
🚀 Ubicación del Código y Documentación
- Código y Artefactos del Sistema: Se encuentran alojados en la ruta:
Fase 2 / Evidencias Proyecto / Evidencias de sistema
- Documentación Técnica y Arquitectura: Se encuentran alojados en la ruta:
Fase 2 / Evidencias Proyecto / Evidencias de documentación

🛠️ Tecnologías Utilizadas
Frontend
- Lenguaje/Framework: HTML5 / JavaScript (Vanilla)
- Estilos: CSS3
Backend
- Lenguaje/Entorno: Node.js / Express.js
- API: REST
Base de Datos y Persistencia
- PostgreSQL / LocalStorage (Navegador)
Infraestructura y Herramientas
- Git, GitHub, pgAdmin 4, Postman

🛠️ Requisitos e Instalación
Prerrequisitos
- Node.js v18.0 o superior
- PostgreSQL 14+
- Git
Pasos para Ejecutar Localmente
1. Clonar el repositorio:
git clone https://github.com/ThomasPuma/2026_2_MA_CAPSTONE_005D_GRUPO_6.git
cd 2026_2_MA_CAPSTONE_005D_GRUPO_6

2. Navegar a la carpeta del sistema:
cd "Fase 2/Evidencias Proyecto/Evidencias de sistema"

3. Configurar la Base de Datos:
- Crear una base de datos en PostgreSQL llamada "matteo_masas_db".
- Ejecutar el script SQL ubicado en la raíz de evidencias de sistema (matteo-masas-db.sql).

4. Instalar dependencias del Backend y levantar el proyecto:
cd backend
npm install
npm start

5. Ejecutar el Frontend:
Abre el archivo index.html dentro de la carpeta "frontend" en tu navegador de preferencia o utilizando Live Server en Visual Studio Code.

📌 Notas Finales
Proyecto elaborado como parte del proceso de la asignatura Capstone (2026_2_MA_CAPSTONE_005D_GRUPO_6).

```
