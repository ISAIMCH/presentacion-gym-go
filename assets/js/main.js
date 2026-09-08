document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // 1. LÓGICA DE LA BARRA DE NAVEGACIÓN (LOGIN)
    // ==========================================
    const userName = localStorage.getItem('userName');
    const userNavContainer = document.getElementById('userNavContainer');

    if (userNavContainer) {
        if (userName) {
            // Usuario logueado: Mostrar ícono, nombre y menú desplegable
            userNavContainer.innerHTML = `
                <a href="#" class="text-dark text-decoration-none d-flex align-items-center dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false" style="cursor: pointer;">
                    <i class="bi bi-person-check-fill fs-5 me-2 text-primary"></i>
                    <span class="fw-medium small">${userName}</span>
                </a>
                
                <ul class="dropdown-menu dropdown-menu-end border-0 shadow-sm mt-3 rounded-4 p-2">
                    <li><h6 class="dropdown-header text-secondary">Mi Cuenta</h6></li>
                    <li><a class="dropdown-item py-2 rounded" href="#"><i class="bi bi-person me-2 text-muted"></i>Mi perfil</a></li>
                    <li><a class="dropdown-item py-2 rounded" href="#"><i class="bi bi-box-seam me-2 text-muted"></i>Historial de pedidos</a></li>
                    <li><a class="dropdown-item py-2 rounded" href="#"><i class="bi bi-geo-alt me-2 text-muted"></i>Agenda de direcciones</a></li>
                    <li><a class="dropdown-item py-2 rounded" href="#"><i class="bi bi-credit-card me-2 text-muted"></i>Métodos de pago</a></li>
                    <li><hr class="dropdown-divider my-2"></li>
                    <li>
                        <a class="dropdown-item py-2 rounded text-danger fw-medium" href="#" id="logoutBtn">
                            <i class="bi bi-door-open me-2"></i>Cerrar sesión
                        </a>
                    </li>
                </ul>
            `;

            // Darle vida al botón de cerrar sesión dentro del menú
            document.getElementById('logoutBtn').addEventListener('click', (e) => {
                e.preventDefault();
                localStorage.removeItem('token');
                localStorage.removeItem('userName');
                window.location.reload(); 
            });
        } else {
            // Usuario NO logueado: Devolver el ícono normal con el enlace al login
            userNavContainer.innerHTML = `
                <a href="pages/login.html" class="text-dark text-decoration-none">
                    <i class="bi bi-person fs-5"></i>
                </a>
            `;
        }
    }

    // ==========================================
    // 2. LÓGICA DEL MAPA INTERACTIVO (LEAFLET)
    // ==========================================
    const mapaContenedor = document.getElementById('miMapaRuta');

    if (mapaContenedor) {
        // Inicializar el mapa centrado en un punto medio
        const map = L.map('miMapaRuta').setView([19.4326, -99.1332], 9); // Coordenadas de CDMX

        // Cargar la capa visual del mapa desde OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(map);

        // Configurar Leaflet Routing Machine para trazar la ruta
        L.Routing.control({
            waypoints: [
                L.latLng(19.4326, -99.1332), // Punto A: Centro de CDMX
                L.latLng(20.028215, -99.225026)  // Punto B: Sucursal en Mixquiahuala, Hidalgo
            ],    
            language: 'es', // Instrucciones en español
            lineOptions: {
                styles: [{ color: '#0d6efd', opacity: 0.8, weight: 6 }] // Línea azul estilo Bootstrap
            },
            routeWhileDragging: false,
            addWaypoints: false
        }).addTo(map);
    }
});