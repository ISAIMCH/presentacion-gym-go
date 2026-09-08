const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

// Agregar justo arriba de router.post('/login', ...)
router.post('/register', async (req, res) => {
    try {
        // Ahora extraemos todos los datos del formulario
        const { nombre, apellidos, fechaNacimiento, email, password } = req.body;

        // Validar si el correo ya está registrado
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ msg: 'El correo ya está registrado' });
        }

        // Crear la "sal" y encriptar la contraseña
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Crear el nuevo usuario con todos sus datos y guardarlo en MongoDB
        user = new User({
            nombre,
            apellidos,
            fechaNacimiento,
            email,
            password: hashedPassword
        });

        await user.save();

        res.status(201).json({ msg: 'Usuario registrado exitosamente' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Error en el servidor al registrar' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Verificar si el usuario existe
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ msg: 'Usuario no encontrado' });
        }

        // 2. Comparar la contraseña ingresada con el Hash de la BD
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Contraseña incorrecta' });
        }

        // 3. Generar y enviar el Token (JWT)
        const token = jwt.sign(
            { id: user._id }, 
            process.env.JWT_SECRET, 
            { expiresIn: '2h' }
        );

        // ¡NUEVO! Ahora también enviamos el nombre al frontend
        res.json({ 
            token, 
            user: { 
                id: user._id, 
                email: user.email,
                nombre: user.nombre,       // Añadimos el nombre
                apellidos: user.apellidos  // Añadimos los apellidos
            } 
        });
    } catch (err) {
        res.status(500).json({ msg: 'Error en el servidor' });
    }
});

module.exports = router;