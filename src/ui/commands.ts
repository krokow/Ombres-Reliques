export interface ParsedCommand {
  name: string;
  args: string[];
}

/** Splits "give potion 3" into { name: 'give', args: ['potion', '3'] }. */
export function parseCommand(line: string): ParsedCommand | null {
  const parts = line.trim().split(/\s+/).filter(Boolean);
  const [name, ...args] = parts;
  if (!name) return null;
  return { name: name.toLowerCase(), args };
}

export interface CommandDef {
  help: string;
  run(args: string[]): string;
}

export class CommandRegistry {
  private readonly commands = new Map<string, CommandDef>();

  constructor() {
    this.register('help', {
      help: 'liste les commandes',
      run: () =>
        Array.from(this.commands.entries())
          .map(([name, def]) => `${name} — ${def.help}`)
          .join('\n'),
    });
  }

  register(name: string, def: CommandDef): void {
    this.commands.set(name, def);
  }

  execute(line: string): string {
    const parsed = parseCommand(line);
    if (!parsed) return '';
    const cmd = this.commands.get(parsed.name);
    if (!cmd) return `Commande inconnue : ${parsed.name} (tape "help")`;
    try {
      return cmd.run(parsed.args);
    } catch (err) {
      return `Erreur : ${err instanceof Error ? err.message : String(err)}`;
    }
  }
}
