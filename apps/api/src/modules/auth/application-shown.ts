/** An application (an AI assistant) as qando shows it to the person who allows it or disconnects it. */
export interface ApplicationShown {
  readonly name: string;
  /** The host of the address its document is published at, e.g. `claude.ai`. */
  readonly host: string;
}

/**
 * The application whose document is published at `address`, as qando shows it: the name its
 * document gave (`stored`, as Better Auth stored it), or the host of that address when it gave
 * none, and that host, which is the address the application names itself by. The consent page
 * and "Apps conectadas" name it alike.
 */
export function applicationShown(address: string, stored: string | null): ApplicationShown {
  const { host } = new URL(address);
  return { name: stored ?? host, host };
}
