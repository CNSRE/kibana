define(function (require) {
  var elasticsearch = require('bower_components/elasticsearch/elasticsearch');
  var sinon = require('test_utils/auto_release_sinon');

  var Mapper = require('components/courier/mapper');
  var fieldMapping = require('fixtures/field_mapping');
  var fieldMappingWithDupes = require('fixtures/mapping_with_dupes');
  var nextTick = require('utils/next_tick');

  require('angular-mocks');
  return function extendCourierSuite() {
    inject(function (es, courier) {
      describe('Mapper', function () {
        var source, mapper;

        beforeEach(function () {
          source = courier.createSource('search')
            .index('valid')
            .size(5);
          mapper = new Mapper(courier);

          // Stub out a mini mapping response.
          sinon.stub(es.indices, 'getFieldMapping', function (params, callback) {
            if (params.index === 'valid') {
              nextTick(callback, undefined, fieldMapping);
            } else if (params.index === 'dupes') {
              nextTick(callback, undefined, fieldMappingWithDupes);
            } else {
              nextTick(callback, new Error('Error: Not Found'), undefined);
            }
          });

          sinon.stub(es, 'getSource', function (params, callback) {
            if (params.id === 'valid') {
              nextTick(callback, undefined, {'baz': {'type': 'long'}, 'foo.bar': {'type': 'string'}});
            } else {
              nextTick(callback, new Error('Error: Not Found'), undefined);
            }
          });

          sinon.stub(es, 'delete', function (params, callback) {
            nextTick(callback, undefined, true);
          });
        });

        it('provides a constructor for the Mapper class', function (done) {
          var mapper = new Mapper(courier);
          expect(mapper).to.be.a(Mapper);
          done();
        });

        it('has getFieldsFromMapping function that returns a mapping', function (done) {
          mapper.getFieldsFromMapping(source, function (err, mapping) {
            expect(es.indices.getFieldMapping.called).to.be(true);
            expect(mapping['foo.bar'].type).to.be('string');
            done();
          });
        });

        it('has getFieldsFromCache that returns an error for uncached indices', function (done) {
          source = courier.createSource('search')
            .index('invalid')
            .size(5);

          mapper.getFieldsFromCache(source, function (err, mapping) {
            expect(es.getSource.called).to.be(true);
            expect(err.message).to.be('Error: Not Found');
            done();
          });
        });

        it('has getFieldsFromCache that returns a mapping', function (done) {
          mapper.getFieldsFromCache(source, function (err, mapping) {
            expect(es.getSource.called).to.be(true);
            expect(mapping['foo.bar'].type).to.be('string');
            done();
          });
        });

        it('has a getFieldsFromObject function', function (done) {
          expect(mapper.getFieldsFromObject).to.be.a('function');
          done();
        });

        it('has a getFields that returns a mapping from cache', function (done) {
          mapper.getFields(source, function (err, mapping) {
            expect(es.getSource.called).to.be(true);
            expect(es.indices.getFieldMapping.called).to.be(false);
            expect(mapping['foo.bar'].type).to.be('string');
            done();
          });
        });

        it('can get fields from a cached object if they have been retrieved before', function (done) {
          sinon.spy(mapper, 'getFieldsFromObject');
          mapper.getFields(source, function (err, mapping) {

            mapper.getFields(source, function (err, mapping) {
              expect(mapping['foo.bar'].type).to.be('string');
              expect(mapper.getFieldsFromObject.calledOnce);
              done();
            });
          });
        });

        it('gets fields from the mapping if not already cached', function (done) {
          sinon.stub(mapper, 'getFieldsFromCache', function (source, callback) {
            callback({error: 'Stubbed cache get failure'});
          });

          sinon.stub(es, 'index', function (params, callback) {
            nextTick(callback, null, {});
          });

          sinon.spy(mapper, 'getFieldsFromMapping');

          mapper.getFields(source, function (err, mapping) {
            expect(mapping['foo.bar'].type).to.be('string');
            expect(mapper.getFieldsFromMapping.calledOnce);

            done();
          });
        });

        it('throws an error if it is unable to cache to Elasticsearch', function (done) {
          sinon.stub(mapper, 'getFieldsFromCache', function (source, callback) {
            callback({error: 'Stubbed failure'});
          });

          sinon.stub(es, 'index', function (params, callback) {
            callback({error: 'Stubbed cache write failure'});
          });

          // TODO: Correctly test thrown errors.
          sinon.stub(courier, '_error', function () { return; });

          mapper.getFields(source, function (err, mapping) {
            expect(courier._error.calledOnce);
          });

          done();
        });

        it('has getFields that throws an error for invalid indices', function (done) {
          source = courier.createSource('search')
            .index('invalid')
            .size(5);

          sinon.stub(es, 'index', function (params, callback) {
            nextTick(callback, undefined, {});
          });

          mapper.getFields(source, function (err, mapping) {
            expect(err).to.be.ok();
            done();
          });
        });

        it('has a clearCache that calls es.delete', function (done) {
          mapper.clearCache(source, function () {
            expect(es.delete.called).to.be(true);
            done();
          });
        });

        it('has a clearCache that clears the object cache', function (done) {
          mapper.getFields(source, function (err, mapping) {
            expect(mapper.getFieldsFromObject(source)).to.be.a(Object);
            mapper.clearCache(source, function () {
              expect(mapper.getFieldsFromObject(source)).to.be(false);
              done();
            });
          });
        });

        it('has a getFieldMapping that returns the mapping for a field', function (done) {
          mapper.getFieldMapping(source, 'foo.bar', function (err, field) {
            expect(field).to.be.a(Object);
            done();
          });
        });

        it('has a getFieldMapping that returns the mapping for a field', function (done) {
          mapper.getFieldMapping(source, 'foo.bar', function (err, field) {
            expect(field.type).to.be('string');
            done();
          });
        });

        it('has a getFieldsMapping that returns the mapping for multiple fields', function (done) {
          mapper.getFieldsMapping(source, ['foo.bar', 'baz'], function (err, mapping) {
            expect(mapping['foo.bar'].type).to.be('string');
            expect(mapping.baz.type).to.be('long');
            done();
          });
        });

        it('has a getFieldsFromMapping that throws an error if a field is defined differently in 2 indices', function (done) {
          source = courier.createSource('search').index('dupes');

          // TODO: Correctly test thrown errors.
          sinon.stub(courier, '_error', function () { return; });

          mapper.getFieldsFromMapping(source, function (err, mapping) {
            expect(courier._error.calledOnce);
            done();
          });
        });

        it('has an ignoreFields that sets the type of a field to "ignore"', function (done) {
          mapper.getFields(source, function (err, mapping) {
            mapper.getFieldMapping(source, 'foo.bar', function (err, field) {
              expect(field.type).to.be('string');
              mapper.ignoreFields(source, 'foo.bar', function (err, mapping) {
                expect(mapping['foo.bar'].type).to.be('ignore');
                done();
              });
            });
          });
        });

      });
    });
  };
});