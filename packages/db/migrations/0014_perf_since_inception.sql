-- Add a 'since_inception' performance period so we can store a full monthly
-- cumulative-TWR history (the account's whole life), not just YTD / 1Y points.
alter type perf_period add value if not exists 'since_inception';
