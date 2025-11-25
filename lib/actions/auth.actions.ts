'use server';

import {auth} from "@/lib/better-auth/auth";
import {inngest} from "@/lib/inngest/client";
import {headers} from "next/headers";

export const signUpWithEmail = async ({ email, password, fullName, country, investmentGoals, riskTolerance, preferredIndustry }:SignUpFormData) => {

    if (!auth) {
        return { success: false, error: "Auth service not initialized (Internal Server Error)" };
    }

    try {
        const response = await auth.api.signUpEmail({
            body: { email, password, name: fullName },
            // ensure cookies/session are properly set in a Next.js app router environment
            headers: await headers(),
        });

        if(response) {
            await inngest.send({
                name: 'app/user.created',
                data: { email, name: fullName, country, investmentGoals, riskTolerance, preferredIndustry, }
            })
        }

        return { success: true, data: response}

    } catch (e) {
        console.log('Sign up failed', e)
        const errorMessage = e instanceof Error ? e.message : 'Sign up failed'
        return { success: false, error: errorMessage }
    }
}

export const signInWithEmail = async ({ email, password }: SignInFormData) => {

    if (!auth) {
        return { success: false, error: "Auth service not initialized (Internal Server Error)" };
    }

    try {
        const response = await auth.api.signInEmail({ body: { email, password } })

        return { success: true, data: response}
    } catch (e) {
        console.log('Sign in failed', e)
        return { success: false, error: 'Sign in failed' }
    }
}

export const signOut = async () => {
    try {
        await auth.api.signOut({ headers: await headers() });
    } catch(e) {
        console.log('Sign out failed', e);
        return { success: false, error: 'Sign out failed' };
    }
}
