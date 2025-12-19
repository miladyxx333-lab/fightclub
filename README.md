# CyberPollo Arena 2.0 - KillPollo Tournament 🐔🛡️

¡Bienvenido a la experiencia definitiva de combate de pollos y apuestas en la blockchain de Solana!

Este proyecto incluye tanto el Frontend (Juego Web) como el Backend (Servidor de Pagos Solana Pay).

## Estructura del Proyecto

*   **Frontend**: Archivos HTML/JS/CSS en la raíz (`index.html`, `store.html`, etc.).
*   **Backend**: Carpeta `solana-pay-server/` (API Express para pagos).
*   **Assets**: Imágenes y metadatos en `assets/`.

## 🚀 Cómo Iniciar

### 1. Preparar el Backend (Pagos)
El sistema de pagos requiere un pequeño servidor Node.js corriendo localmente.

1.  Abre una terminal.
2.  Navega a la carpeta del servidor:
    ```bash
    cd solana-pay-server
    ```
3.  Instala las dependencias:
    ```bash
    npm install
    ```
4.  Inicia el servidor:
    ```bash
    npm start
    ```
    *Deberías ver: `Server running on http://localhost:3000`*

### 2. Iniciar el Frontend (Juego)
Puedes abrir el juego directamente en tu navegador o usar un servidor local (recomendado).

*   **Opción A (Directa)**: Haz doble click en `index.html`.
*   **Opción B (Servidor - Mejor)**: Si tienes Python instalado:
    ```bash
    # En la carpeta raíz del proyecto
    python3 -m http.server 8080
    ```
    Luego visita `http://localhost:8080` en tu navegador.

## 🎮 Características

*   **Combate**: Lanza los dados y predice el resultado (Bajo/Alto).
*   **Tienda**: Compra créditos usando **Solana Pay** (Devnet/Mainnet configurable).
*   **Admin Dashboard**: Monitor de ventas en `admin.html`.
*   **NFTs**: Galería de la colección KillPollo.
*   **Idiomas**: Soporte completo Español/Inglés.

## ⚠️ Notas Importantes

*   **Wallet**: Para recibir pagos reales, edita `store.html` (línea ~205) con tu dirección pública de Solana.
*   **Red**: Por defecto, el backend usa `api.mainnet-beta.solana.com`.

---
*Developed by Antigravity Agents*
