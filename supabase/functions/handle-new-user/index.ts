import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Supabase Edge Function: Handle New User
 * 
 * Triggered by: Auth.users INSERT
 * Action: 
 * 1. Creates a default personal organization for the user.
 * 2. Adds the user as an 'owner' to that organization.
 */

serve(async (req) => {
    try {
        const { record } = await req.json()

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const orgName = `${record.email.split('@')[0]}'s Workspace`

        // 1. Create Default Org
        const { data: org, error: orgError } = await supabase
            .from('orgs')
            .insert({ name: orgName })
            .select()
            .single()

        if (orgError) throw orgError

        // 2. Link User to Org as Owner
        const { error: memberError } = await supabase
            .from('org_members')
            .insert({
                org_id: org.id,
                user_id: record.id,
                role: 'owner'
            })

        if (memberError) throw memberError

        console.log(`Successfully bootstrapped workspace for user: ${record.id}`)

        return new Response(JSON.stringify({ status: 'success' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
        })
    } catch (error) {
        console.error('Error handling new user:', error.message)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
