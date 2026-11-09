/* global module, Buffer */
/** Foto chica de prueba (JPEG 64×48) para los recorridos que suben fotos: `locator.setInputFiles(FOTO_JPEG)`. */
const FOTO_JPEG = {
  name: 'foto-prueba.jpg',
  mimeType: 'image/jpeg',
  buffer: Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAwAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCOiiivjT78KKKKACiiigAooooAu6RHbzapbw3MJljlkVNu4r1YDJxz0zS2cdu9nOZYfuIxMxYja2PkAGcHJ65zxn0qpDNJbzxzRNtkjYMpxnBByKlW9nS1+yjyzFknBiUnJ4JyRmtIyilqZThJu6fbqah0+0ae4jEO0WUzIcMf3wVHbnnjJj7Y+9WbfRxqLeWKMRieHeUBJCncy8Z5/hz+NDaldsY2MvMZyCFAycYyePm445zUM88lxJvlYEgAABQoA9ABwKqc4NWSIp06id2yOiiisToCiiigAooooAKKKKACiiigAooooA//2Q==', 'base64'),
};
/** PDF mínimo válido, para comprobantes. */
const PDF = {
  name: 'comprobante.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'),
};
module.exports = { FOTO_JPEG, PDF };
