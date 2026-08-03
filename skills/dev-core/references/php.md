# DEV-CORE — PHP (8.x+) Reference

Applies on top of the core discipline when writing PHP (Laravel, Symfony, or custom frameworks).

- **Strict types mandatory**: `declare(strict_types=1);` at the top of every file; strict parameter and return types on all functions and methods.
- **Immutable DTOs & value objects**: `readonly` classes or properties with constructor property promotion:

  ```php
  public function __construct(
      public readonly string $id,
      public readonly string $email,
  ) {}
  ```

- **Backed enums over constants** for fixed sets of states (`enum OrderStatus: string`).
- **`match` over `switch`** for exhaustiveness, readability, and clean value assignment.
- **Domain exceptions**: throw specific exceptions (`UserNotFoundException`, `InvalidOrderStateException`). Never catch `\Throwable` or `\Exception` without handling explicitly or rethrowing.
- **Thin controllers, thin models**: business logic lives in Action classes, Services, or domain entities — not in HTTP controllers or Eloquent/Doctrine models.
- **Mass assignment protection**: typed DTOs or explicit `$fillable`; never pass raw request arrays into models.
- **N+1 prevention**: eager-load relations (`with()`, joins); never run queries inside a loop over models.
- **Constructor injection** through interfaces over global containers or inline instantiation of concrete classes.
- **PSR compliance**: PSR-12 / PER-CS style, PSR-4 autoloading, PSR-3 structured logging.
- **Static analysis**: pass PHPStan/Psalm cleanly at the level pinned by the project's config; raising the level is its own task, not a side effect.
