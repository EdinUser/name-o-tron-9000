# Downloads & Releases

The latest installers are published on the server and described by `release.json`.

## Latest release

{% if release %}
- **Version:** {{ release.get("version", "unknown") }}
- **Date:** {{ release.get("date", "unknown") }}
{% else %}
_Release info unavailable. The site will update after the next release run._
{% endif %}

## Installers

### Linux
{% if release and release.get("platforms", {}).get("linux") %}
{% for filename in release["platforms"]["linux"] %}
- [{{ filename }}](https://name-o-tron.kirilov.dev/downloads/{{ release["version"] }}/{{ filename }})
{% endfor %}
{% else %}
No Linux installers listed.
{% endif %}

### Windows
{% if release and release.get("platforms", {}).get("windows") %}
{% for filename in release["platforms"]["windows"] %}
- [{{ filename }}](https://name-o-tron.kirilov.dev/downloads/{{ release["version"] }}/{{ filename }})
{% endfor %}
{% else %}
No Windows installers listed.
{% endif %}

