from contextlib import contextmanager
from contextvars import ContextVar
from typing import TypeVar

from sqlalchemy.sql.base import Executable, ExecutableOption

T = TypeVar('T', bound=Executable)

_options_context: ContextVar[tuple[ExecutableOption, ...]] = ContextVar('options_context')


@contextmanager
def options_context(*options: ExecutableOption):
    """
    Context manager for setting options in ContextVar.

    >>> with options_context(joinedload(Changeset.user).load_only(User.id)):
    """
    token = _options_context.set(options)
    try:
        yield
    finally:
        _options_context.reset(token)


def is_options_context() -> bool:
    """Check if options context is set."""
    return _options_context.get(None) is not None


def apply_options_context(stmt: T) -> T:
    """Apply options context."""
    options = _options_context.get(None)
    return stmt.options(*options) if (options is not None) else stmt
