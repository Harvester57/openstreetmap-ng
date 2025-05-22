import gc
import tracemalloc
from collections.abc import Callable
from datetime import UTC, datetime
from functools import wraps
from itertools import pairwise
from tracemalloc import Statistic, StatisticDiff

import pytest
from sizestr import sizestr

from app.lib.xmltodict import XMLToDict, get_xattr
from speedup import CDATA


def _check_for_leaks(func: Callable):
    func_lineno = func.__code__.co_firstlineno
    iterations = 3
    memory_usage = [0] * iterations

    def filter_stats[T: list[Statistic] | list[StatisticDiff]](stats: T) -> T:
        return [
            stat  #
            for stat in stats
            if stat.traceback[0].filename == __file__
            and stat.traceback[0].lineno >= func_lineno
        ]  # type: ignore

    @wraps(func)
    def wrapper(*args, **kwargs):
        gc.collect()
        tracemalloc.start()
        baseline = tracemalloc.take_snapshot()

        for i in range(iterations):
            func(*args, **kwargs)
            gc.collect()
            snapshot = tracemalloc.take_snapshot()
            memory_usage[i] = sum(
                stat.size for stat in filter_stats(snapshot.statistics('lineno'))
            )

        tracemalloc.stop()

        # Check for a consistent upward trend which would indicate a leak
        is_leaking = all(left < right for left, right in pairwise(memory_usage))
        if is_leaking:
            for leak in filter_stats(snapshot.compare_to(baseline, 'lineno')):  # type: ignore
                print(f'Leaked {sizestr(leak.size_diff)}: {leak}')
            raise AssertionError('Leaked memory')

    return wrapper


@pytest.mark.parametrize(
    ('input', 'expected'),
    [
        (
            b'<root><key1 attr="1"/><key2>text</key2><key1 attr="2"/></root>',
            {'root': {'key1': [{'@attr': '1'}, {'@attr': '2'}], 'key2': 'text'}},
        ),
        (
            b'<root><key1 attr="1"/><key2>text</key2><key2 attr="2">text2</key2></root>',
            {
                'root': {
                    'key1': {'@attr': '1'},
                    'key2': ['text', {'#text': 'text2', '@attr': '2'}],
                }
            },
        ),
        (
            b'<osmChange><modify id="1"/><create id="2"><tag k="test" v="zebra"/></create><modify id="3"/></osmChange>',
            {
                'osmChange': [
                    ('modify', {'@id': 1}),
                    ('create', {'@id': 2, 'tag': [{'@k': 'test', '@v': 'zebra'}]}),
                    ('modify', {'@id': 3}),
                ]
            },
        ),
        (
            "<?xml version='1.0' encoding='UTF-8'?>\n<root><test>&lt;span&gt;/user/小智智/traces/10908782&lt;/span&gt;</test></root>".encode(),
            {'root': {'test': '<span>/user/小智智/traces/10908782</span>'}},
        ),
    ],
)
@_check_for_leaks
def test_xml_parse(input, expected):
    assert XMLToDict.parse(input) == expected


@pytest.mark.parametrize(
    ('input', 'expected'),
    [
        (
            {
                'osmChange': [
                    ('@attrib', 'yes'),
                    ('modify', '1'),
                    ('create', '2'),
                    ('modify', '3'),
                    (
                        'modify',
                        {
                            '@id': '4',
                            '@timestamp': datetime(2020, 1, 1, tzinfo=UTC),
                            '@visible': True,
                        },
                    ),
                ]
            },
            '<?xml version=\'1.0\' encoding=\'UTF-8\'?>\n<osmChange attrib="yes"><modify>1</modify><create>2</create><modify>3</modify><modify id="4" timestamp="2020-01-01T00:00:00Z" visible="true"/></osmChange>\n',
        ),
        (
            {
                'osmChange': {
                    'create': [],
                    'modify': [
                        {'@id': 1},
                        {
                            '@id': 2,
                            'tag': [
                                {'@k': 'test', '@v': 'zebra'},
                                {'@k': 'test2', '@v': 'zebra2'},
                            ],
                        },
                        {},
                    ],
                    'delete': {'@id': 3},
                }
            },
            '<?xml version=\'1.0\' encoding=\'UTF-8\'?>\n<osmChange><modify id="1"/><modify id="2"><tag k="test" v="zebra"/><tag k="test2" v="zebra2"/></modify><modify/><delete id="3"/></osmChange>\n',
        ),
        (
            {'root': {'#text': '<span>/user/小智智/traces/10908782</span>'}},
            "<?xml version='1.0' encoding='UTF-8'?>\n<root>&lt;span&gt;/user/小智智/traces/10908782&lt;/span&gt;</root>\n",
        ),
        (
            {'root': {'#text': CDATA('<hello>')}},
            "<?xml version='1.0' encoding='UTF-8'?>\n<root><![CDATA[<hello>]]></root>\n",
        ),
        (
            {'root': []},
            "<?xml version='1.0' encoding='UTF-8'?>\n",
        ),
    ],
)
@_check_for_leaks
def test_xml_unparse(input, expected):
    assert XMLToDict.unparse(input).replace('"', "'") == expected.replace('"', "'")


def test_xml_unparse_xattr():
    xattr = get_xattr(is_json=False)
    unparsed = XMLToDict.unparse({
        'root': {xattr('test', xml='test_xml'): 'test_value'}
    })
    expected = (
        "<?xml version='1.0' encoding='UTF-8'?>\n<root test_xml=\"test_value\"/>\n"
    )
    assert unparsed.replace('"', "'") == expected.replace('"', "'")


def test_xml_unparse_invalid_multi_root():
    with pytest.raises(ValueError):
        XMLToDict.unparse({'root1': {}, 'root2': {}})
