document.addEventListener('DOMContentLoaded', () => {
    const registroForm = document.getElementById('registroForm');

    if (registroForm) {
        registroForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Capturar todos los campos nuevos
            const nombre = document.getElementById('regNombre').value;
            const apellidos = document.getElementById('regApellidos').value;
            const fechaNacimiento = document.getElementById('regFechaNac').value;
            const email = document.getElementById('regEmail').value;
            const password = document.getElementById('regPassword').value;

            try {
                const response = await fetch('http://localhost:3000/api/auth/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    // Enviamos todos los datos al backend
                    body: JSON.stringify({ nombre, apellidos, fechaNacimiento, email, password })
                });

                const data = await response.json();

                if (response.ok) {
                    alert('Cuenta creada con éxito. Ahora puedes iniciar sesión.');
                    window.location.href = 'login.html'; 
                } else {
                    alert('Error: ' + data.msg);
                }
            } catch (error) {
                console.error('Error de conexión:', error);
                alert('No se pudo conectar con el servidor.');
            }
        });
    }
});