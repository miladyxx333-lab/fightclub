class AuthSystem {
    constructor() {
        this.currentUser = JSON.parse(localStorage.getItem('cp_current_user'));
        this.users = JSON.parse(localStorage.getItem('cp_users')) || {};
    }

    register(username, password) {
        if (this.users[username]) {
            return { success: false, message: 'El usuario ya existe' };
        }

        const newUser = {
            username,
            password, // In a real app, hash this!
            credits: 0,
            joinedDate: new Date().toISOString()
        };

        this.users[username] = newUser;
        this.saveUsers();
        return { success: true, message: 'Usuario creado exitosamente' };
    }

    login(username, password) {
        const user = this.users[username];
        if (user && user.password === password) {
            this.currentUser = user;
            this.saveCurrentUser();
            return { success: true, user };
        }
        return { success: false, message: 'Credenciales inválidas' };
    }

    logout() {
        this.currentUser = null;
        localStorage.removeItem('cp_current_user');
        window.location.href = 'login.html';
    }

    addCredits(amount) {
        if (!this.currentUser) return;

        this.currentUser.credits += amount;

        // Update master record
        this.users[this.currentUser.username].credits = this.currentUser.credits;

        this.saveUsers();
        this.saveCurrentUser();
    }

    deductCredits(amount) {
        if (!this.currentUser) return false;
        if (this.currentUser.credits < amount) return false;

        this.currentUser.credits -= amount;
        this.users[this.currentUser.username].credits = this.currentUser.credits;

        this.saveUsers();
        this.saveCurrentUser();
        return true;
    }

    getCurrentUser() {
        return this.currentUser;
    }

    requireAuth() {
        if (!this.currentUser) {
            window.location.href = 'login.html';
        }
    }

    saveUsers() {
        localStorage.setItem('cp_users', JSON.stringify(this.users));
    }

    saveCurrentUser() {
        localStorage.setItem('cp_current_user', JSON.stringify(this.currentUser));
    }
}

const auth = new AuthSystem();
