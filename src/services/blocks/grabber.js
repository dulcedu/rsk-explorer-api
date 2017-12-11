import dataSource from '../../lib/db.js'
import conf from '../../../config'
import Web3 from 'web3'

const config = Object.assign({}, conf.blocks)

dataSource.then(db => {
  console.log('Using configuration:')
  console.log(config)
  const collection = db.collection(config.blockCollection)
  collection
    .createIndexes([
      {
        key: { number: 1 }
      }
    ])
    .then(doc => {
      if (doc.ok) {
        const exporter = new SaveBlocks(config, collection)
        exporter.grabBlocks()
      } else {
        console.log('Error creating collection indexes')
      }
    })
})

class SaveBlocks {
  constructor(config, db) {
    this.config = config
    this.db = db
    this.web3 = new Web3(
      new Web3.providers.HttpProvider(
        'http://' + config.node + ':' + config.port
      )
    )

    this.grabBlocks = () => {
      if ('listenOnly' in this.config && this.config.listenOnly === true)
        this.listenBlocks()
      else
        setTimeout(() => {
          this.grabBlock(config.blocks.pop())
        }, 2000)
    }

    this.listenBlocks = () => {
      let newBlocks = this.web3.eth.filter('latest')
      newBlocks.watch((error, log) => {
        if (error) {
          console.log('Error: ' + error)
        } else if (log == null) {
          console.log('Warning: null block hash')
        } else {
          this.grabBlock(log)
        }
      })
    }

    this.grabBlock = blockHashOrNumber => {
      let desiredBlockHashOrNumber

      // check if done
      if (blockHashOrNumber == undefined) {
        return
      }

      if (typeof blockHashOrNumber === 'object') {
        if ('start' in blockHashOrNumber && 'end' in blockHashOrNumber) {
          desiredBlockHashOrNumber = blockHashOrNumber.end
        } else {
          console.log(
            'Error: Aborted becasue found a interval in blocks ' +
              "array that doesn't have both a start and end."
          )
          process.exit(9)
        }
      } else {
        desiredBlockHashOrNumber = blockHashOrNumber
      }

      if (this.web3.isConnected()) {
        this.web3.eth.getBlock(
          desiredBlockHashOrNumber,
          true,
          (error, blockData) => {
            if (error) {
              console.log(
                'Warning: error on getting block with hash/number: ' +
                  desiredBlockHashOrNumber +
                  ': ' +
                  error
              )
            } else if (blockData == null) {
              console.log(
                'Warning: null block data received from the block with hash/number: ' +
                  desiredBlockHashOrNumber
              )
            } else {
              if (
                'terminateAtExistingDB' in this.config &&
                this.config.terminateAtExistingDB === true
              ) {
                this.checkBlockDBExistsThenWrite(blockData)
              } else {
                this.writeBlockToDB(blockData)
              }
              if (
                'listenOnly' in this.config &&
                this.config.listenOnly === true
              )
                return

              if ('hash' in blockData && 'number' in blockData) {
                // If currently working on an interval (typeof blockHashOrNumber === 'object') and
                // the block number or block hash just grabbed isn't equal to the start yet:
                // then grab the parent block number (<this block's number> - 1). Otherwise done
                // with this interval object (or not currently working on an interval)
                // -> so move onto the next thing in the blocks array.
                if (
                  typeof blockHashOrNumber === 'object' &&
                  ((typeof blockHashOrNumber['start'] === 'string' &&
                    blockData['hash'] !== blockHashOrNumber['start']) ||
                    (typeof blockHashOrNumber['start'] === 'number' &&
                      blockData['number'] > blockHashOrNumber['start']))
                ) {
                  blockHashOrNumber['end'] = blockData['number'] - 1
                  this.grabBlock(blockHashOrNumber)
                } else {
                  this.grabBlock(config.blocks.pop())
                }
              } else {
                console.log(
                  'Error: No hash or number was found for block: ' +
                    blockHashOrNumber
                )
                process.exit(9)
              }
            }
          }
        )
      } else {
        console.log(
          'Error: Aborted due to web3 is not connected when trying to ' +
            'get block ' +
            desiredBlockHashOrNumber
        )
        process.exit(9)
      }
    }
    this.writeBlockToDB = blockData => {
      try {
        db.insertOne(blockData)
        if (!('quiet' in this.config && this.config.quiet === true)) {
          console.log(
            'DB successfully written for block number ' +
              blockData.number.toString()
          )
        }
      } catch (err) {
        if (err.code === 11000) {
          console.log(
            'Skip: Duplicate key ' + blockData.number.toString() + ': ' + err
          )
        } else {
          console.log(
            'Error: Aborted due to error on ' +
              'block number ' +
              blockData.number.toString() +
              ': ' +
              err
          )
          process.exit(9)
        }
      }
    }

    /**
     * Checks if the a record exists for the block number then ->
     *     if record exists: abort
     *     if record DNE: write a file for the block
     */
    this.checkBlockDBExistsThenWrite = blockData => {
      db.findOne({ number: blockData.number }).then(doc => {
        if (doc) {
          console.log(
            'Aborting because block number: ' +
              blockData.number.toString() +
              ' already exists in DB.'
          )
          process.exit(9)
        } else {
          this.writeBlockToDB(blockData)
        }
      })
    }
    /*
  Patch Missing Blocks
*/
    this.patchBlocks = () => {
      // number of blocks should equal difference in block numbers
      let firstBlock = 0
      let lastBlock = this.web3.eth.blockNumber
      this.blockIter(firstBlock, lastBlock)
    }

    this.blockIter = (firstBlock, lastBlock) => {
      // if consecutive, deal with it
      if (lastBlock < firstBlock) return
      if (lastBlock - firstBlock === 1) {
        ;[lastBlock, firstBlock].forEach(blockNumber => {
          Block.find({ number: blockNumber }, (err, b) => {
            if (!b.length) this.grabBlock(firstBlock)
          })
        })
      } else if (lastBlock === firstBlock) {
        Block.find({ number: firstBlock }, function(err, b) {
          if (!b.length) grabBlock(firstBlock)
        })
      } else {
        Block.count(
          { number: { $gte: firstBlock, $lte: lastBlock } },
          (err, c) => {
            let expectedBlocks = lastBlock - firstBlock + 1
            if (c === 0) {
              this.grabBlock({ start: firstBlock, end: lastBlock })
            } else if (expectedBlocks > c) {
              console.log('Missing: ' + JSON.stringify(expectedBlocks - c))
              let midBlock = firstBlock + parseInt((lastBlock - firstBlock) / 2)
              this.blockIter(firstBlock, midBlock)
              this.blockIter(midBlock + 1, lastBlock)
            } else return
          }
        )
      }
    }
  }
}

process.on('unhandledRejection', err => {
  console.error(err)
  process.exit(1)
})