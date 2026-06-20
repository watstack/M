# Creating Custom Bets

Custom bets allow you to create betting markets beyond the standard match result and correct score options. Examples include:
- "Highest-Scoring Match" with multiple match options
- "First Team to Score" with team options
- Any other custom outcome you want to offer

## Two Methods to Create Custom Bets

### Method 1: Using the CLI Script (Recommended for Automation)

The `scripts/create-custom-bet.js` script provides a programmatic way to create custom bets.

#### Prerequisites
- Supabase credentials (`SUPABASE_URL` and `SUPABASE_ANON_KEY`)
- Node.js environment with dependencies installed (`npm install`)

#### Usage

```bash
SUPABASE_URL=<url> SUPABASE_ANON_KEY=<key> \
node scripts/create-custom-bet.js <code> <name> <odds-json> [admin-token]
```

#### Parameters
- `code`: Tournament code (e.g., `9HE9Y5`)
- `name`: Display name for the custom bet
- `odds-json`: JSON string with option labels and odds
- `admin-token`: (Optional) Admin token for extra validation

#### Example

```bash
SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_ANON_KEY=your-anon-key \
node scripts/create-custom-bet.js 9HE9Y5 "Highest-Scoring Match" \
'{
  "Netherlands vs Sweden": 1.67,
  "Germany vs Ivory Coast": 4.00,
  "Ecuador vs Curaçao": 10.00,
  "Tunisia vs Japan": 20.00
}'
```

### Method 2: Using SQL in Supabase Dashboard (Quickest for One-Off Bets)

For a one-time custom bet, you can run SQL directly in the Supabase dashboard.

#### Steps

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) for your project
2. Navigate to **SQL Editor**
3. Click **New query**
4. Paste the SQL from `supabase/create-highest-scoring-match-bet.sql`
5. Click **Run**

#### SQL Template

```sql
WITH tournament_data AS (
  SELECT id FROM tournaments WHERE code = '9HE9Y5'
)
INSERT INTO bet_markets (
  tournament_id,
  market_type,
  match_name,
  status,
  odds_json,
  created_at
)
SELECT
  (SELECT id FROM tournament_data),
  'custom',
  'Highest-Scoring Match',
  'open',
  jsonb_build_object(
    'Netherlands vs Sweden', 1.67,
    'Germany vs Ivory Coast', 4.00,
    'Ecuador vs Curaçao', 10.00,
    'Tunisia vs Japan', 20.00
  ),
  NOW()
WHERE EXISTS (SELECT 1 FROM tournament_data)
RETURNING id, tournament_id, market_type, match_name, odds_json, status;
```

## Format Requirements

### Tournament Code
- 6 characters (e.g., `9HE9Y5`)
- Must exist in the database

### Bet Name
- Any text up to 200 characters
- Should clearly describe what players are betting on
- Examples:
  - "Highest-Scoring Match"
  - "First Team to Score in Final"
  - "Most Assists in Tournament"

### Odds JSON
- Object with option labels as keys and numeric odds as values
- All odds must be >= 1.01
- Examples:
  ```json
  {
    "Team A": 2.50,
    "Team B": 1.80,
    "Team C": 3.20
  }
  ```
  ```json
  {
    "Yes": 1.50,
    "No": 2.50
  }
  ```

## Validation

Both methods validate:
- ✓ Tournament exists with the given code
- ✓ All odds are numeric and >= 1.01
- ✓ JSON format is valid
- ✓ At least 2 options are provided

## Viewing Custom Bets

Once created, custom bets appear in the betting interface:
1. Go to the betting page: `betting.html?code=<tournament-code>`
2. Click **Custom Bets** sort button to view
3. Players can place bets on any option with valid odds

## Settling Custom Bets

Admins can settle custom markets through the admin panel:
1. Go to betting page with admin token
2. Navigate to **Admin** tab
3. Scroll to "Custom Market Settlement"
4. Select the winning option
5. Click **Settle**

This awards coins to players who bet on the winning option.

## API Endpoint

For integration with external systems, you can also use the Node.js script or Supabase RPC:

```javascript
// Example using Supabase client
const { data, error } = await db
  .from('bet_markets')
  .insert([{
    tournament_id: 'tournament-uuid',
    market_type: 'custom',
    match_name: 'Highest-Scoring Match',
    status: 'open',
    odds_json: {
      'Netherlands vs Sweden': 1.67,
      'Germany vs Ivory Coast': 4.00,
      'Ecuador vs Curaçao': 10.00,
      'Tunisia vs Japan': 20.00
    }
  }])
  .select()
  .single();
```

## Troubleshooting

### "Tournament not found"
- Check that the tournament code exists and is spelled correctly
- Verify the code hasn't been deleted

### "Invalid odds"
- Ensure all odds are numeric
- All odds must be >= 1.01
- No negative odds allowed

### "Invalid JSON"
- Check for syntax errors in the JSON
- Ensure quotes are properly matched
- Use double quotes for keys and string values

## Examples

### Quick Bet: Simple Yes/No
```bash
node scripts/create-custom-bet.js ABC123 "Will there be a penalty?" '{"Yes": 1.90, "No": 1.90}'
```

### Tournament Winner Odds
```bash
node scripts/create-custom-bet.js ABC123 "Tournament Winner" '{
  "Team A": 2.50,
  "Team B": 3.00,
  "Team C": 4.00,
  "Team D": 5.00
}'
```

### Match-Specific Custom
```bash
node scripts/create-custom-bet.js ABC123 "First Goalscorer" '{
  "Player X": 4.00,
  "Player Y": 5.00,
  "Player Z": 6.00,
  "Other": 1.50
}'
```
