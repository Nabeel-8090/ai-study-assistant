"""Central place to configure Python's logging for the whole application.

Every other module just does `logger = logging.getLogger(__name__)` and
calls logger.info/.warning/.error/.exception(...) - the *format* and
*level* those messages are printed with is decided once, here.
"""

import logging


def setup_logging(level: int = logging.INFO) -> None:
    """Configure the root logger's format and level.

    Must be called once, early, before the application starts handling
    requests (see app/main.py). Because Python's logging module is a
    global singleton, every `logging.getLogger(__name__)` created
    anywhere else in the app automatically inherits this configuration -
    there is nothing else to wire up per-module.
    """
    logging.basicConfig(level=level, format="%(levelname)s  %(name)s: %(message)s")
