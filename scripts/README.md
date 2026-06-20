# Scripts

## create-custom-bet.js

Create a custom bet market in Supabase.

### Usage

```bash
SUPABASE_URL=<url> SUPABASE_ANON_KEY=<key> node scripts/create-custom-bet.js <code> <name> <odds-json> [admin-token]
```

### Parameters

- `code`: Tournament code (e.g., `9HE9Y5`)
- `name`: Bet market name (e.g., `"Highest-Scoring Match"`)
- `odds-json`: JSON string with options and odds (e.g., `'{"Netherlands vs Sweden": 1.67, "Germany vs Ivory Coast": 4.00}'`)
- `admin-token` (optional): Admin token for validation

### Example

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

### Output

```
Found tournament: <uuid>
Creating custom market: "Highest-Scoring Match"
Options: { ... }

✓ Custom market created successfully!
  Market ID: <uuid>
  Name: Highest-Scoring Match
  Options: Netherlands vs Sweden, Germany vs Ivory Coast, Ecuador vs Curaçao, Tunisia vs Japan
  Status: open
```
