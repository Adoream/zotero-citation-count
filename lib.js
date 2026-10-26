/* Shared helpers use ES5 syntax for historical clients. */
var CitationHelpers = {
  doi: function (item) {
    var value = item.getField('DOI') || '';
    if (!value) {
      var match = (item.getField('extra') || '').match(/^DOI:\s*(.+)$/im);
      value = match ? match[1] : '';
    }
    value = value.replace(/^\s+|\s+$/g, '').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
    return /^10\.\d{4,9}\/\S+$/i.test(value) ? value : null;
  },
  publication: function (body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('The API returned an invalid response');
    if (body.error) {
      throw new Error((body.error.code || 'api_error') + ': ' + (body.error.message || 'Publication lookup failed'));
    }
    var result = body.data;
    if (result === null) throw new Error('No publication found for this DOI');
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('The API did not return publication data');
    if (result.error) throw new Error((result.error.code || 'upstream_error') + ': ' + (result.error.message || 'Publication lookup failed'));
    this.count(result.citationCount);
    if (result.influentialCitationCount !== undefined && result.influentialCitationCount !== null) this.count(result.influentialCitationCount);
    return result;
  },
  count: function (value) {
    if (typeof value !== 'number' && typeof value !== 'string') throw new Error('The API did not return a valid citation count');
    if (typeof value === 'string' && !/^\d+$/.test(value)) throw new Error('The API returned an invalid citation count');
    var count = Number(value);
    if (!isFinite(count) || Math.floor(count) !== count || count < 0 || count > 9007199254740991) throw new Error('The API returned an invalid citation count');
    return count;
  },
  read: function (extra) {
    var match = (extra || '').match(/^Citation Count:\s*(\d+)\s*$/im);
    return match ? match[1] : '';
  },
  updatedDate: function (extra) {
    var match = (extra || '').match(/^Citation Count Updated:\s*(.+)$/im);
    if (!match) return '';
    var date = new Date(match[1]);
    if (!isFinite(date.getTime())) return '';
    var month = date.getUTCMonth() + 1, day = date.getUTCDate();
    return date.getUTCFullYear() + '-' + (month < 10 ? '0' : '') + month + '-' + (day < 10 ? '0' : '') + day;
  },
  merge: function (extra, result, date) {
    var fields = ['Citation Count: ' + this.count(result.citationCount), 'Citation Count Source: api.rua.dev (Semantic Scholar)', 'Citation Count Updated: ' + date];
    if (result.influentialCitationCount !== undefined && result.influentialCitationCount !== null) fields.push('Influential Citation Count: ' + this.count(result.influentialCitationCount));
    var input = (extra || '').split(/\r?\n/), lines = [];
    for (var i = 0; i < input.length; i++) {
      if (!/^\s*(Citation Count|Citation Count Source|Citation Count Updated|Influential Citation Count):/i.test(input[i])) lines.push(input[i]);
    }
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    return lines.concat(fields).join('\n');
  }
};
if (typeof module !== 'undefined') module.exports = CitationHelpers;
