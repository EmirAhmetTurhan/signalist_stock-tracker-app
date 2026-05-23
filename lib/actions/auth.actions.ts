'use server';

import { auth } from "@/lib/better-auth/auth";
import { inngest } from "@/lib/inngest/client";
import { headers } from "next/headers";
import { signUpSchema, signInSchema, validate } from "@/lib/validations/schemas";

function logError(context: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Auth] ${context}: ${message}`);
}

export const signUpWithEmail = async (input: SignUpFormData) => {
    const parsed = validate(signUpSchema, input);
    if (!parsed.success) {
        return { success: false, error: parsed.error };
    }
    const { email, password, fullName, country, investmentGoals, riskTolerance, preferredIndustry } = parsed.data;

    if (!auth) {
        return { success: false, error: "Auth service not initialized (Internal Server Error)" };
    }

    try {
        const response = await auth.api.signUpEmail({
            body: { email, password, name: fullName },
            headers: await headers(),
        });

        if (response) {
            await inngest.send({
                name: 'app/user.created',
                data: { email, name: fullName, country, investmentGoals, riskTolerance, preferredIndustry }
            });
        }

        return { success: true, data: response };
    } catch (e) {
        logError('Sign up failed', e);
        return { success: false, error: 'Sign up failed' };
    }
};

export const signInWithEmail = async (input: SignInFormData) => {
    const parsed = validate(signInSchema, input);
    if (!parsed.success) {
        return { success: false, error: parsed.error };
    }
    const { email, password } = parsed.data;

    if (!auth) {
        return { success: false, error: "Auth service not initialized (Internal Server Error)" };
    }

    try {
        const response = await auth.api.signInEmail({ body: { email, password } });
        return { success: true, data: response };
    } catch (e) {
        logError('Sign in failed', e);
        return { success: false, error: 'Sign in failed' };
    }
};

export const signOut = async () => {
    try {
        await auth.api.signOut({ headers: await headers() });
    } catch (e) {
        logError('Sign out failed', e);
        return { success: false, error: 'Sign out failed' };
    }
};

export const updateProfile = async ({ name, image }: { name?: string; image?: string }) => {
    if (!auth) {
        return { success: false, error: "Auth service not initialized (Internal Server Error)" };
    }

    try {
        const response = await auth.api.updateUser({
            body: { name, image },
            headers: await headers(),
        });
        return { success: true, data: response };
    } catch (e) {
        logError('Update profile failed', e);
        return { success: false, error: 'Update profile failed' };
    }
};
