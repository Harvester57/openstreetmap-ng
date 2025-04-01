from fastapi import APIRouter

from app.config import (
    CHANGESET_QUERY_DEFAULT_LIMIT,
    CHANGESET_QUERY_MAX_LIMIT,
    ELEMENT_RELATION_MEMBERS_LIMIT,
    ELEMENT_WAY_MEMBERS_LIMIT,
    MAP_QUERY_AREA_MAX_SIZE,
    NOTE_QUERY_AREA_MAX_SIZE,
    NOTE_QUERY_DEFAULT_LIMIT,
    NOTE_QUERY_LEGACY_MAX_LIMIT,
    TRACE_POINT_QUERY_AREA_MAX_SIZE,
    TRACE_POINT_QUERY_DEFAULT_LIMIT,
)
from app.lib.auth_context import auth_user
from app.lib.user_role_limits import UserRoleLimits
from app.lib.xmltodict import get_xattr

router = APIRouter(prefix='/api')

_LEGACY_IMAGERY_BLACKLIST = (
    '.*\\.google(apis)?\\..*/.*',
    'http://xdworld\\.vworld\\.kr:8080/.*',
    '.*\\.here\\.com[/:].*',
    '.*\\.mapy\\.cz.*',
)


@router.get('/capabilities')
@router.get('/capabilities.xml')
@router.get('/capabilities.json')
@router.get('/0.6/capabilities')
@router.get('/0.6/capabilities.xml')
@router.get('/0.6/capabilities.json')
async def legacy_capabilities():
    user = auth_user()
    user_roles = user['roles'] if user is not None else None
    changeset_max_size = UserRoleLimits.get_changeset_max_size(user_roles)
    xattr = get_xattr()

    return {
        'api': {
            'version': {
                # legacy capabilities endpoint only supports 0.6
                xattr('minimum'): '0.6',
                xattr('maximum'): '0.6',
            },
            'area': {
                xattr('maximum'): min(MAP_QUERY_AREA_MAX_SIZE, TRACE_POINT_QUERY_AREA_MAX_SIZE),
            },
            'changesets': {
                xattr('maximum_elements'): changeset_max_size,
                xattr('default_query_limit'): CHANGESET_QUERY_DEFAULT_LIMIT,
                xattr('maximum_query_limit'): CHANGESET_QUERY_MAX_LIMIT,
            },
            'note_area': {
                xattr('maximum'): NOTE_QUERY_AREA_MAX_SIZE,
            },
            'notes': {
                xattr('default_query_limit'): NOTE_QUERY_DEFAULT_LIMIT,
                xattr('maximum_query_limit'): NOTE_QUERY_LEGACY_MAX_LIMIT,
            },
            'relationmembers': {
                xattr('maximum'): ELEMENT_RELATION_MEMBERS_LIMIT,
            },
            'status': {
                # this is over-complicated, just check HTTP_503_SERVICE_UNAVAILABLE
                xattr('database'): 'online',
                xattr('api'): 'online',
                xattr('gpx'): 'online',
            },
            'timeout': {
                xattr('seconds'): 15,
            },
            'tracepoints': {
                xattr('per_page'): TRACE_POINT_QUERY_DEFAULT_LIMIT,
            },
            'waynodes': {
                xattr('maximum'): ELEMENT_WAY_MEMBERS_LIMIT,
            },
        },
        'policy': {
            'imagery': {
                'blacklist': [{xattr('regex'): entry} for entry in _LEGACY_IMAGERY_BLACKLIST],
            },
        },
    }


@router.get('/versions')
@router.get('/versions.xml')
@router.get('/versions.json')
async def legacy_versions():
    xattr = get_xattr()
    return {'api': {xattr('versions', xml='version'): ['0.6']}}
