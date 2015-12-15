var fs = require('fs');
var path = require('path');
var minimatch = require('minimatch');
var unitCoverage = require('unit-coverage');
var reporters = unitCoverage.reporters;
var Instrumenter = unitCoverage.Instrumenter;
var CoverageInfo = unitCoverage.obj.CoverageInfo;
var fileSetFactory = unitCoverage.fileSetFactory;

function UnitCoverageReporter(unitCoverageConfig, logger) {
    unitCoverageConfig = unitCoverageConfig || {};

    var log = logger.create('unit-coverage');

    this._browserCoverages = {};

    this.onBrowserComplete = function(browser, result) {
        if (result.coverage) {
            this._browserCoverages[browser.id] = CoverageInfo.fromJSON(result.coverage.data);
        } else {
            log.error('Coverage data was not found. Source files were not instrumented.');
        }
    };

    this.onRunComplete = function(browsers) {
        var finalCoverage;
        browsers.forEach(function(browser) {
            var coverage = this._browserCoverages[browser.id];
            delete this._browserCoverages[browser.id];
            if (coverage) {
                if (!finalCoverage) {
                    finalCoverage = coverage;
                } else {
                    finalCoverage.add(coverage);
                }
            }
        }, this);

        if (finalCoverage) {
            var reporterConfig = unitCoverageConfig.reporter || {};
            var reporterType = reporterConfig.type || 'summary';
            var reporterOutputFile = reporterConfig.file;
            var reporterAdditional = [].concat(reporterConfig.additional || []);
            var reporter = reporters[reporterType];

            if (reporter) {
                if (reporterAdditional.length > 0) {
                    var instrumenterConfig = unitCoverageConfig.instrumenter || {};
                    var instrumenterTests = instrumenterConfig.tests || [];
                    var instrumenterSources = instrumenterConfig.sources || ['**/*.js'];
                    var instrumenterFileSetName = instrumenterConfig.fileSetName || 'simple';
                    var instrumenterFileSetOptions = instrumenterConfig.fileSetOptions || {};
                    var root = instrumenterConfig.root || process.cwd();

                    var files = Array.prototype.concat.apply([], reporterAdditional.map(function(additionalPath) {
                        return collectFiles(path.join(root, additionalPath));
                    })).filter(function(filename) {
                        var relativePath = path.relative(root, filename);
                        return !finalCoverage.getFileInfo(relativePath) &&
                            !filenameMatchesSomeOf(relativePath, instrumenterTests) &&
                            filenameMatchesSomeOf(relativePath, instrumenterSources);
                    });

                    if (files.length > 0) {
                        var fileSet = fileSetFactory.create(instrumenterFileSetName);
                        if (!fileSet) {
                            throw new Error('File set "' + instrumenterFileSetName + '" not found');
                        }
                        fileSet.configure(instrumenterFileSetOptions);
                        var instrumenter = new Instrumenter(fileSet, root);
                        files.forEach(function(filename) {
                            var content = fs.readFileSync(filename, 'utf8');
                            finalCoverage.add(instrumenter.generateCoverageInfo(content, filename));
                        });
                    }
                }

                var report = reporter(finalCoverage);
                if (reporterOutputFile) {
                    fs.writeFileSync(reporterOutputFile, report);
                    log.info('Coverage report was saved: ' + reporterOutputFile);
                } else {
                    console.log(report);
                }
            } else {
                log.error('Reporter "' + reporterType + '" was not found');
            }
        }
    };
}

UnitCoverageReporter.$inject = ['config.unitCoverage', 'logger'];

module.exports = UnitCoverageReporter;

/**
 * Returns all nested files inside the specified path.
 *
 * @param {String} pathToCollect
 * @returns {String[]}
 */
function collectFiles(pathToCollect) {
    var stat = fs.statSync(pathToCollect);
    if (stat.isDirectory()) {
        return Array.prototype.concat.apply([], fs.readdirSync(pathToCollect).map(function(filename) {
            return collectFiles(path.join(pathToCollect, filename));
        }));
    } else {
        return [pathToCollect];
    }
}

/**
 * @param {String} filename
 * @param {String} pattern
 */
function filenameMatches(filename, pattern) {
    return minimatch(filename, pattern);
}

/**
 * @param {String} filename
 * @param {String[]} patterns
 */
function filenameMatchesSomeOf(filename, patterns) {
    return patterns.some(function (exclude) {
        return filenameMatches(filename, exclude);
    });
}
