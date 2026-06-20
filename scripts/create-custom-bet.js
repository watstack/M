#!/usr/bin/env node
/**
 * Create a custom bet market in Supabase.
 * Usage: node scripts/create-custom-bet.js <tournament-code> <bet-name> <options-json> [admin-token]
 *
 * Example:
 *   node scripts/create-custom-bet.js 9HE9Y5 "Highest-Scoring Match" '{
 *     "Netherlands vs Sweden": 1.67,
 *     "Germany vs Ivory Coast": 4.00,
 *     "Ecuador vs Curaçao": 10.00,
 *     "Tunisia vs Japan": 20.00
 *   }' <admin-token>
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_ANON_KEY environment variables required');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function createCustomBet(code, betName, oddsJson, adminToken) {
  try {
    // Find tournament
    const { data: tournament, error: tourneyErr } = await db
      .from('tournaments')
      .select('id')
      .eq('code', code)
      .single();

    if (tourneyErr || !tournament) {
      console.error(`Tournament not found with code: ${code}`);
      process.exit(1);
    }

    console.log(`Found tournament: ${tournament.id}`);

    // If adminToken is provided, validate it
    if (adminToken) {
      const { data: validTourney, error: validErr } = await db
        .from('tournaments')
        .select('id')
        .eq('code', code)
        .eq('admin_token', adminToken)
        .single();

      if (validErr || !validTourney) {
        console.error('Invalid admin token');
        process.exit(1);
      }
    }

    // Parse the odds JSON
    let odds;
    try {
      odds = typeof oddsJson === 'string' ? JSON.parse(oddsJson) : oddsJson;
    } catch (e) {
      console.error('Invalid JSON for odds:', e.message);
      process.exit(1);
    }

    // Validate odds
    for (const [label, value] of Object.entries(odds)) {
      const numVal = parseFloat(value);
      if (isNaN(numVal) || numVal < 1.01) {
        console.error(`Invalid odds for "${label}": ${value} (must be >= 1.01)`);
        process.exit(1);
      }
    }

    console.log(`Creating custom market: "${betName}"`);
    console.log('Options:', odds);

    // Create the custom market
    const { data: market, error: createErr } = await db
      .from('bet_markets')
      .insert([{
        tournament_id: tournament.id,
        market_type: 'custom',
        match_name: betName,
        status: 'open',
        odds_json: odds,
      }])
      .select()
      .single();

    if (createErr) {
      console.error('Failed to create market:', createErr);
      process.exit(1);
    }

    console.log('\n✓ Custom market created successfully!');
    console.log(`  Market ID: ${market.id}`);
    console.log(`  Name: ${market.match_name}`);
    console.log(`  Options: ${Object.keys(odds).join(', ')}`);
    console.log(`  Status: ${market.status}`);

    process.exit(0);
  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 3) {
  console.error('Usage: node scripts/create-custom-bet.js <code> <bet-name> <odds-json> [admin-token]');
  console.error('\nExample:');
  console.error('  node scripts/create-custom-bet.js 9HE9Y5 "Highest-Scoring Match" \'{"Netherlands vs Sweden": 1.67, "Germany vs Ivory Coast": 4.00}\'');
  process.exit(1);
}

const code = args[0];
const betName = args[1];
const oddsJson = args[2];
const adminToken = args[3] || null;

createCustomBet(code, betName, oddsJson, adminToken);
