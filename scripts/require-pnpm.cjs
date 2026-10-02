const agent = process.env.npm_config_user_agent ?? ''
if (!agent.startsWith('pnpm/')) {
  console.error('Pageforge uses pnpm. Run corepack pnpm install from the repository root.')
  process.exit(1)
}
