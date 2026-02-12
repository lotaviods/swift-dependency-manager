/**
 * Input validation utilities for the Swift Dependency Manager extension.
 *
 * Used to validate user-provided values (URLs, version strings, paths)
 * before updating Package.swift files.
 */

/**
 * Validate that the input is not empty or whitespace-only.
 *
 * @param input - The string to validate
 * @returns An error message if the input is empty or whitespace-only, or `null` if valid
 */
export function validateNonEmpty(input: string): string | null {
  if (input.trim().length === 0) {
    return 'Value must not be empty or whitespace-only';
  }
  return null;
}
