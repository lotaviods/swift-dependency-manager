/** Informações sobre uma branch Git */
export interface BranchInfo {
  /** Nome da branch (sem prefixo remotes/origin/) */
  name: string;
  /** Se é a branch atualmente em checkout */
  isCurrent: boolean;
  /** Se é uma branch remota */
  isRemote: boolean;
}

/** Resultado da listagem de branches */
export interface BranchListResult {
  branches: BranchInfo[];
}

/** Tipos de erro de checkout */
export type CheckoutError =
  | { type: 'uncommitted_changes'; message: string }
  | { type: 'git_error'; message: string };

/** Resultado do checkout */
export type CheckoutResult =
  | { success: true }
  | { success: false; error: CheckoutError };

/** Tipo da função de execução de comandos (injetável para testes) */
export type ExecCommand = (
  command: string,
  options: { cwd: string }
) => Promise<{ stdout: string; stderr: string }>;

/** Parseia a saída do `git branch -a` e retorna lista de BranchInfo */
export function parseBranchOutput(stdout: string): BranchInfo[] {
  if (!stdout.trim()) {
    return [];
  }

  return stdout
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.length > 0)
    .filter(line => !line.includes('->'))
    .map(parseBranchLine)
    .filter((b): b is BranchInfo => b !== null);
}

/** Detecta se um erro de checkout é por alterações não commitadas */
export function classifyCheckoutError(stderr: string): CheckoutError {
  const lower = stderr.toLowerCase();
  if (
    lower.includes('your local changes') ||
    lower.includes('please commit your changes or stash them') ||
    lower.includes('changes would be overwritten')
  ) {
    return { type: 'uncommitted_changes', message: stderr };
  }
  return { type: 'git_error', message: stderr };
}


/** Lista branches disponíveis para um diretório */
export async function listBranches(
  packagePath: string,
  exec: ExecCommand
): Promise<BranchListResult> {
  try {
    const { stdout } = await exec('git branch -a', { cwd: packagePath });
    return { branches: parseBranchOutput(stdout) };
  } catch {
    return { branches: [] };
  }
}

/** Inicializa um submodule Git */
export async function initSubmodule(
  parentPath: string,
  submodulePath: string,
  exec: ExecCommand
): Promise<boolean> {
  try {
    await exec(`git submodule update --init ${submodulePath}`, { cwd: parentPath });
    return true;
  } catch {
    return false;
  }
}

/** Executa checkout de uma branch */
export async function checkout(
  packagePath: string,
  branchName: string,
  exec: ExecCommand
): Promise<CheckoutResult> {
  try {
    await exec(`git checkout ${branchName}`, { cwd: packagePath });
    return { success: true };
  } catch (err: unknown) {
    const stderr =
      err instanceof Error ? (err as Error & { stderr?: string }).stderr ?? err.message : String(err);
    return { success: false, error: classifyCheckoutError(stderr) };
  }
}


function parseBranchLine(line: string): BranchInfo | null {
  const isCurrent = line.startsWith('*');
  // Remove leading "* " or "  "
  const trimmed = line.replace(/^[* ]\s*/, '');

  if (!trimmed) {
    return null;
  }

  const isRemote = trimmed.startsWith('remotes/');
  const name = isRemote
    ? trimmed.replace(/^remotes\/origin\//, '')
    : trimmed;

  if (!name) {
    return null;
  }

  return { name, isCurrent, isRemote };
}
