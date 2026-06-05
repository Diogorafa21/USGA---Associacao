document.addEventListener('DOMContentLoaded', function() {
    
    // 1. VERIFICAR LOGIN E MUDAR BOTÃO HEADER
    const isLoggedIn = localStorage.getItem('usga_login'); // Verifica "token" falso
    const loginBtn = document.querySelector('header .btn-primary'); // Seleciona botão Login
    
    // Se existir botão de login e utilizador estiver logado
    if (loginBtn && isLoggedIn === 'true') {
        loginBtn.textContent = 'O meu Perfil';
        loginBtn.href = 'perfil.html';
        loginBtn.style.backgroundColor = '#333'; // Opcional: cor diferente para perfil
    }

    // 2. LÓGICA DA PÁGINA DE LOGIN (Apenas corre no login.html)
    const loginForm = document.querySelector('#loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            // Simulação de Login bem sucedido
            localStorage.setItem('usga_login', 'true');
            // Guardar dados fictícios se não existirem
            if(!localStorage.getItem('usga_username')) {
                localStorage.setItem('usga_username', 'João Exemplo');
                localStorage.setItem('usga_socio_type', 'Sócio Efetivo nº 1024');
            }
            window.location.href = 'index.html'; // Redireciona para home
        });
    }

    // 3. LOGOUT (Apenas corre no perfil.html)
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            localStorage.removeItem('usga_login');
            window.location.href = 'index.html';
        });
    }

    // 4. PREVIEW E UPLOAD DE FOTO (Apenas corre no perfil.html)
    const photoInput = document.getElementById('photoInput');
    const profileImg = document.getElementById('profileImg');

    // Carregar foto salva ao abrir a página
    if (profileImg) {
        const savedPhoto = localStorage.getItem('usga_photo');
        if (savedPhoto) {
            profileImg.src = savedPhoto;
        }
    }

    if (photoInput) {
        photoInput.addEventListener('change', function() {
            const file = this.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    // Atualiza a imagem na página
                    profileImg.src = e.target.result;
                    // Salva a string da imagem no localStorage (Simulação)
                    localStorage.setItem('usga_photo', e.target.result);
                }
                reader.readAsDataURL(file);
            }
        });
    }
});