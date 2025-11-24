'use server';

interface AuthResult {
    success: boolean;
    error?: string;
}

export async function signInWithEmail(data: { email: string; password: string }): Promise<AuthResult> {
    try {
        const {email, password} = data;

        console.log("Data received by server:", email, password);

        await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay simulation

        if (email === 'test@example.com' && password === '12345678') {
            return {success: true};
        }

        return {success: false, error: 'Invalid email or password!'};

    } catch (error) {
        console.error("Auth error:", error);
        return {success: false, error: 'Something went wrong.'};
    }
}

export async function signUpWithEmail(data: { email: string; password: string; name?: string }): Promise<AuthResult> {
    console.log("Registration data:", data);
    return {success: true};
}