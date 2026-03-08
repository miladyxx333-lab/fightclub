class AuthSystem {
    constructor() {
        this.currentUser = JSON.parse(localStorage.getItem('cp_current_user_v2'));
    }

    async requireAuth() {
        if (!this.currentUser) {
            window.location.href = 'login.html';
            return;
        }
        await this.refreshUser();
    }

    async refreshUser() {
        if (!this.currentUser) return;

        try {
            const { data, error } = await supabase
                .from('game_users')
                .select('*')
                .eq('id', this.currentUser.id)
                .single();

            if (data) {
                this.currentUser = data;
                this.saveSession();
            }
        } catch (e) {
            console.error("Error refrescando usuario", e);
        }
    }

    async register(username, password) {
        // Verificar si existe
        const { data: existing } = await supabase
            .from('game_users')
            .select('id')
            .eq('username', username)
            .single();

        if (existing) {
            return { success: false, message: 'El usuario ya existe' };
        }

        // Crear usuario
        const newUser = {
            username: username,
            password: password, // Almacenado directo como en el ejemplo (MVP)
            credits: 100
        };

        const { data, error } = await supabase
            .from('game_users')
            .insert([newUser])
            .select()
            .single();

        if (error) {
            console.error(error);
            return { success: false, message: 'Error creando usuario: ' + error.message };
        }

        return { success: true, message: 'Usuario creado exitosamente' };
    }

    async login(username, password) {
        const { data, error } = await supabase
            .from('game_users')
            .select('*')
            .eq('username', username)
            .eq('password', password)
            .single();

        if (error || !data) {
            return { success: false, message: 'Credenciales inválidas' };
        }

        this.currentUser = data;
        this.saveSession();
        return { success: true, user: data };
    }

    logout() {
        this.currentUser = null;
        localStorage.removeItem('cp_current_user_v2');
        window.location.href = 'login.html';
    }

    saveSession() {
        localStorage.setItem('cp_current_user_v2', JSON.stringify(this.currentUser));
    }

    getCurrentUser() {
        return this.currentUser;
    }

    async addCredits(amount) {
        if (!this.currentUser) return;

        const newTotal = this.currentUser.credits + amount;

        // Optimistic UI
        this.currentUser.credits = newTotal;
        this.saveSession();

        const { data, error } = await supabase.rpc('add_credits_secure', {
            p_user_id: this.currentUser.id,
            p_password: this.currentUser.password,
            p_amount: amount
        });

        if (error || !data) console.error("Error sync credits", error);
    }

    async deductCredits(amount) {
        if (!this.currentUser) return false;

        const currentCredits = this.currentUser.credits;
        if (currentCredits < amount) return false;

        // Optimistic update
        this.currentUser.credits -= amount;
        this.saveSession();

        const { data, error } = await supabase.rpc('deduct_credits_secure', {
            p_user_id: this.currentUser.id,
            p_password: this.currentUser.password,
            p_amount: amount
        });

        if (error || !data) {
            console.error("Error deducting credits", error);
            // Revertir cambio optimista
            this.currentUser.credits += amount;
            this.saveSession();
            return false;
        }
        return true;
    }
}

const auth = new AuthSystem();
